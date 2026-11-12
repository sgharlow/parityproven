/**
 * CLI: npm run convert -- --object <Schema.Name> [--seed N] [--runs N]
 *      npm run convert -- --file conversions/<db>/<Schema.Name>.sql
 *      npm run convert -- --all        (also: npm run verify)
 *
 * For one object:
 *   1. deploy the original T-SQL (unchanged) to a scratch SQL Server database and the spec tables to PostgreSQL
 *   2. if conversions/<db>/<obj>.draft.sql exists, run the property against it (the engine's first draft)
 *   3. deploy the final conversion (verification step 1), run the property (step 3)
 *   4. every mutant of the final conversion must be reported as FAILING (harness has been seen failing)
 *   5. write the pair record from what was measured
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

import { MssqlClient } from "../harness/clients/mssql-client.js";
import { PgClient } from "../harness/clients/pg-client.js";
import { mssqlEndpoint, pgEndpoint } from "../harness/endpoints.js";
import { ensureAdventureWorksRestored, ensureWwiRestored } from "../harness/restore.js";
import {
  deployPgFunction, dropPgObject, fetchSourceCollation, fetchSourceCompatibilityLevel, fetchSourceDefinition, prepareSqlServer, preparePostgres, readSql, runProperty,
  ssCall, pgCall, type Connections, type RunOutcome,
} from "../harness/generic/run.js";
import { clearAll, runBenchmark, type BenchResult } from "../harness/generic/bench.js";
import { mappingsFor, type ObjectSpec } from "../harness/generic/spec.js";
import { SPECS, specByName } from "../conversions/specs.js";
import { lineDiff } from "../pairs/diff.js";
import { autoMutants } from "../conversions/automutants.js";
import type { PairRecord } from "../pairs/schema.js";
import { computeStatus, STEP4_NA_REASON } from "../pairs/status.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const HARNESS_VERSION = "harness-generic-0.3.0";
const VOLUME = 5000;   // rows per table for step 4; kept modest so Docker stays light

const envFile = resolve(ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m?.[1] && m[2] !== undefined) process.env[m[1].trim()] = m[2].trim();
  }
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};

function traps(spec: ObjectSpec): string[] {
  const cols = spec.tables.flatMap((t) => t.columns);
  const out: string[] = [];
  if (cols.some((c) => c.nullable)) out.push("NULL in every nullable column");
  if (cols.some((c) => c.type.kind === "decimal")) out.push("numeric rounding and scale (decimal edge values)");
  if (cols.some((c) => c.type.kind === "datetime2")) out.push("datetime boundaries at the cutoffs (inputs normalised to µs)");
  if (cols.some((c) => c.type.kind === "nvarchar")) out.push("empty string and trailing spaces");
  if (spec.stateCheck) out.push("state after the call (every row of the changed tables) and the error outcome");
  if (spec.orderKey.length) out.push("ORDER BY key (ties compared as multisets)");
  return out;
}

function mutantSql(spec: ObjectSpec, finalSql: string, from: string, to: string): string {
  // work on executable text only, so a mutation can never land inside a comment
  const code = finalSql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  if (!code.includes(from)) throw new Error(`mutant text not found in ${spec.name}: ${JSON.stringify(from)}`);
  const esc = spec.pgFunction.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // rename the object (first whole-name occurrence) so the mutant never replaces the real conversion
  // function replacements: a "$" in the mutant text (regular expressions) must not be read as a replacement pattern
  return code.replace(from, () => to).replace(new RegExp(`${esc}(?![\\w])`), () => `${spec.pgFunction}_mutant`);
}

async function convertOne(conn: Connections, spec: ObjectSpec, seed: number, runs: number): Promise<boolean> {
  const label = `${spec.schema}.${spec.name}`;
  console.log(`\n=== ${label} (seed ${seed}) ===`);

  const dir = resolve(ROOT, "conversions", spec.database);
  const finalPath = resolve(dir, `${label}.sql`);
  const draftPath = resolve(dir, `${label}.draft.sql`);
  const finalSql = readSql(finalPath);
  const draftSql = existsSync(draftPath) ? readSql(draftPath) : null;

  // the original T-SQL comes from the restored sample database this object belongs to
  const source = new MssqlClient({ ...mssqlEndpoint(), user: "sa", password: conn.saPassword, database: spec.database });
  let definition: string;
  let collation: string;
  let compat: number;
  const dependencyDefinitions: string[] = [];
  try {
    for (const dep of spec.dependencies ?? []) {
      const [schema, name] = dep.split(".");
      dependencyDefinitions.push(await fetchSourceDefinition(source, { schema, name }));
    }
    definition = await fetchSourceDefinition(source, spec);
    collation = await fetchSourceCollation(source);
    compat = await fetchSourceCompatibilityLevel(source);
  } finally {
    await source.close();
  }
  console.log(`scratch database: collation ${collation}, compatibility level ${compat} (the source database's)`);
  const scratch = await prepareSqlServer(conn, spec, definition, collation, compat, dependencyDefinitions);
  try {
    await preparePostgres(conn, spec);
    // dependencies: their verified conversions go first (each one is proved by its own pair record)
    for (const dep of spec.dependencies ?? []) {
      const depSpec = specByName(dep);
      if (!depSpec) throw new Error(`${label} depends on ${dep}, which has no spec`);
      await deployPgFunction(conn, depSpec, readSql(resolve(dir, `${dep}.sql`)));
      console.log(`dependency deployed: ${dep} (conversions/${spec.database}/${dep}.sql; SQL Server: original definition)`);
    }

    // 2. engine first draft
    let draftCheck: PairRecord["evidence"]["engineOutputCheck"];
    if (draftSql) {
      await deployPgFunction(conn, spec, draftSql);
      const d = await runProperty(conn, scratch, spec, { fn: spec.pgFunction, seed, numRuns: runs });
      draftCheck = { step3: d.passed ? "pass" : "fail", seed, detail: d.passed ? undefined : d.failure?.split("\n")[0] };
      console.log(`draft: ${d.passed ? "PASS" : "FAIL"}${d.passed ? "" : " — " + d.failure?.split("\n")[0]}`);
    }

    // 3. final
    let step1: "pass" | "fail" = "pass";
    try {
      await deployPgFunction(conn, spec, finalSql);
    } catch (e) {
      step1 = "fail";
      console.error(`step 1 FAILED (does not deploy on PostgreSQL): ${(e as Error).message}`);
    }
    if (step1 === "fail") return false;

    const f: RunOutcome = await runProperty(conn, scratch, spec, { fn: spec.pgFunction, seed, numRuns: runs });
    console.log(`final: ${f.passed ? "PASS" : "FAIL"} (${f.rowsCompared} rows compared; ${f.samplesWithRows}/${f.samples} samples returned rows; ${f.subMicrosecondNormalised} sub-µs values normalised)`);
    if (!f.passed && spec.knownLimitation && !f.failure?.startsWith("vacuous")) {
      // A miss we expected: record it as a failed pair so it is shown, not hidden.
      const lim = spec.knownLimitation;
      const rest = await runProperty(conn, scratch, spec, { fn: spec.pgFunction, seed, numRuns: runs, excludeColumns: [lim.column] });
      const restLine = rest.passed
        ? `All other columns match the source on ${rest.samplesWithRows}/${rest.samples} generated samples (${rest.rowsCompared} rows); the only difference is "${lim.column}".`
        : `Other columns also differ: ${rest.failure?.split("\n")[0]}`;
      console.log(`known limitation confirmed: ${f.failure?.split("\n")[0]}`);
      console.log(restLine);
      writePair({
        spec, label, definition, draftSql: null, finalSql, f, detected: [], draftCheck,
        status: "failed", step3: "fail", seed,
        failureDetail: `${lim.reason} ${restLine}`,
      });
      return true;
    }
    if (!f.passed) {
      console.error(f.failure);
      console.error(`reproduce: npm run convert -- --object ${label} --seed ${seed}`);
      return false;
    }

    // 4. mutants must be caught (declared by the spec, otherwise generated automatically)
    const mutants = spec.mutants.length ? spec.mutants : autoMutants(finalSql);
    if (mutants.length === 0) {
      console.error("no planted defect could be derived for this conversion; declare mutants in its spec. Not recording a pass.");
      return false;
    }
    const detected: string[] = [];
    for (const m of mutants) {
      // drop the previous mutant first: CREATE OR REPLACE VIEW cannot change a column's type
      await deployPgFunction(conn, spec, mutantSql(spec, finalSql, m.from, m.to), `${spec.pgFunction}_mutant`);
      const r = await runProperty(conn, scratch, spec, { fn: `${spec.pgFunction}_mutant`, seed, numRuns: Math.max(runs, 300), shrink: false });
      const caught = !r.passed && !r.failure?.startsWith("vacuous");
      console.log(`mutant "${m.name}": ${caught ? "detected" : "NOT DETECTED"}`);
      if (caught) detected.push(m.name);
    }
    await dropPgObject(conn, spec, `${spec.pgFunction}_mutant`);
    if (detected.length !== mutants.length) {
      console.error("harness is not trustworthy for this object: a planted defect passed. Not recording a pass.");
      return false;
    }

    // 5. step 4: runtime on a synthetic volume (also compares the full results at volume)
    await deployPgFunction(conn, spec, finalSql);
    if (spec.stateCheck) {
      // A data-changing call is not repeatable on the same data (the first call changes what the next one sees), so the
      // median-of-runs measurement does not apply. Step 4 is n/a for these objects (ruling 2026-11-12).
      console.log("runtime: not measured (object changes data; step 4 n/a by ruling 2026-11-12)");
      writePair({
        spec, label, definition, draftSql, finalSql, f, detected, draftCheck, seed,
        status: "pending", step3: "pass",
      });
      return true;
    }
    const runtime = await runBenchmark(conn, scratch, spec, {
      fn: spec.pgFunction, seed, volume: spec.benchVolume ?? VOLUME, ssSql: ssCall(spec), pgSql: pgCall(spec, spec.pgFunction),
    });
    await clearAll(conn, scratch, spec);
    console.log(
      `runtime: PostgreSQL ${runtime.postgresMs} ms vs SQL Server ${runtime.sqlServerMs} ms = ${runtime.ratio}x (limit ${runtime.threshold}x) on ${runtime.volume} rows/table -> ${runtime.passed ? "step 4 pass" : "step 4 FAIL"}`
    );
    if (runtime.volumeMismatch) console.error(`RESULT MISMATCH AT VOLUME: ${runtime.volumeMismatch}`);

    // 6. pair record
    // any failed step among 1-4 means the object cannot be verified as converted: status "failed"
    const failureDetail = runtime.volumeMismatch
      ? `Results differ at ${runtime.volume} rows per table: ${runtime.volumeMismatch}`
      : !runtime.passed
        ? `Step 4: PostgreSQL ${runtime.postgresMs} ms vs SQL Server ${runtime.sqlServerMs} ms = ${runtime.ratio}x, above the ${runtime.threshold}x limit. Results are equivalent (step 3 pass); see the notes for the cause.`
        : undefined;
    writePair({
      spec, label, definition, draftSql, finalSql, f, detected, draftCheck, seed, runtime,
      status: failureDetail ? "failed" : "pending",
      step3: runtime.volumeMismatch ? "fail" : "pass",
      failureDetail,
    });
    return true;
  } finally {
    await scratch.close();
  }
}

interface PairInput {
  spec: ObjectSpec;
  label: string;
  definition: string;
  draftSql: string | null;
  finalSql: string;
  f: RunOutcome;
  detected: string[];
  draftCheck: PairRecord["evidence"]["engineOutputCheck"];
  status: PairRecord["status"];
  step3: "pass" | "fail";
  seed: number;
  failureDetail?: string;
  runtime?: BenchResult;
}

function writePair(p: PairInput): void {
  const { spec, label, f } = p;
  const pairPath = resolve(ROOT, "pairs", spec.database, `${label}.json`);
  const previous: PairRecord | null = existsSync(pairPath) ? (JSON.parse(readFileSync(pairPath, "utf-8")) as PairRecord) : null;
  const engineOutput = p.draftSql ?? p.finalSql;
  const record: PairRecord = {
    origin: originFor(spec.database),
    conversionType: "tsql-to-plpgsql",
    objectClass: spec.objectClass,
    tier: previous?.tier ?? tierFromInventory(spec),
    code: {
      source: p.definition,
      engineOutput,
      final: p.finalSql,
      diff: lineDiff(engineOutput, p.finalSql),
      engine: "kiro",
      notes: [
        ...(spec.notes ?? []),
        "Verified in an isolated scratch database: the original T-SQL is deployed unchanged; tables contain only the columns the object references, with no foreign key constraints and no pre-existing rows. Every foreign-key column is indexed on both engines (a modelling assumption for the runtime step).",
      ],
    },
    columnMappings: mappingsFor(spec),
    evidence: {
      step1: "pass", step2: previous?.evidence.step2 ?? "not-run", step3: p.step3,
      // ruling 2026-11-12: step 4 is n/a for objects that change data
      step4: p.runtime ? (p.runtime.passed ? "pass" : "fail") : spec.stateCheck ? "n/a" : "not-run",
      // a re-run of the harness does not undo a recorded second review
      step5: previous?.evidence.step5 ?? "not-run",
      // public sample databases: acceptance on real data does not apply
      step6: "n/a",
      reviewer: previous?.evidence.reviewer,
      reviewDate: previous?.evidence.reviewDate,
      testsRun: previous?.evidence.testsRun,
      runtimeRatio: p.runtime?.ratio,
      runtime: p.runtime,
      rowsCompared: f.rowsCompared,
      trapsCovered: traps(spec),
      pbtSeeds: [p.seed],
      engineOutputCheck: p.draftCheck,
      samples: f.samples,
      samplesWithRows: f.samplesWithRows,
      subMicrosecondNormalised: f.subMicrosecondNormalised,
      mutantsDetected: p.detected,
      failureDetail: p.failureDetail,
      harnessVersion: HARNESS_VERSION,
    },
    effort: {
      humanMinutes: previous?.effort.humanMinutes ?? 0,
      engineName: "Kiro",
      engineVersion: "model selected dynamically by Kiro; exact model/version not exposed in the session",
    },
    status: p.status,
  };
  if (spec.stateCheck) record.code.notes = [...(record.code.notes ?? []), STEP4_NA_REASON];
  // the harness decides steps 1, 3 and 4; the status follows the shared rule (a failure stays a failure)
  record.status = p.status === "failed" ? "failed" : computeStatus(record.evidence);
  mkdirSync(dirname(pairPath), { recursive: true });
  writeFileSync(pairPath, JSON.stringify(record, null, 2) + "\n", "utf-8");
  console.log(`pair record written: pairs/${spec.database}/${label}.json (step1 pass, step3 ${p.step3}, status ${p.status})`);
}

const ASSET_BY_DATABASE: Record<string, string> = {
  WideWorldImporters: "WideWorldImporters-Full.bak",
  AdventureWorks2025: "AdventureWorks2025.bak",
};

/** Origin (repo, release, licence, sha256) from sources/manifest.json — never typed by hand. */
function originFor(database: string): Exclude<PairRecord["origin"], "synthetic"> {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, "sources", "manifest.json"), "utf-8")) as {
    entries: Array<{ repo: string; release: string; license: string; assetUrl: string; sha256: string; assetName: string }>;
  };
  const e = manifest.entries.find((x) => x.assetName === ASSET_BY_DATABASE[database]);
  if (!e) throw new Error(`No manifest entry for database ${database}`);
  return { repo: e.repo, release: e.release, license: e.license, assetUrl: e.assetUrl, sha256: e.sha256 };
}

function tierFromInventory(spec: ObjectSpec): PairRecord["tier"] {
  const p = resolve(ROOT, "inventory", `${spec.database}.json`);
  if (!existsSync(p)) return "simple";
  const inv = JSON.parse(readFileSync(p, "utf-8")) as { objects: Array<{ schemaName: string; objectName: string; tier: PairRecord["tier"] }> };
  return inv.objects.find((o) => o.schemaName === spec.schema && o.objectName === spec.name)?.tier ?? "simple";
}

async function main(): Promise<void> {
  const sa = process.env["MSSQL_SA_PASSWORD"];
  const pgPw = process.env["PG_PASSWORD"];
  if (!sa || !pgPw) throw new Error("MSSQL_SA_PASSWORD and PG_PASSWORD must be set (.env)");

  const project = process.env["COMPOSE_PROJECT_NAME"] ?? "docker";
  const restoreOpts = {
    containerName: `${project}-mssql-1`, saPassword: sa,
    manifestPath: resolve(ROOT, "sources", "manifest.json"), tmpDir: resolve(ROOT, ".tmp"),
  };

  const conn: Connections = {
    saPassword: sa,
    mssqlMaster: new MssqlClient({ ...mssqlEndpoint(), user: "sa", password: sa, database: "master" }),
    pg: new PgClient({ ...pgEndpoint(), user: "postgres", password: pgPw, database: "parityproven" }),
  };

  // --file conversions/<db>/<Schema>.<Name>[.draft].sql  (used by the save hook)
  const fromFile = arg("--file")
    ? (arg("--file") as string).replace(/\\/g, "/").split("/").pop()!.replace(/\.draft\.sql$|\.sql$/, "")
    : undefined;
  const specs = process.argv.includes("--all")
    ? SPECS
    : [specByName(fromFile ?? arg("--object") ?? "")].filter((s): s is ObjectSpec => !!s);
  if (specs.length === 0) throw new Error("Usage: convert --object <Schema.Name> | --all  (known: " + SPECS.map((s) => `${s.schema}.${s.name}`).join(", ") + ")");

  const runs = Number(arg("--runs") ?? 200);
  let ok = true;
  const restored = new Set<string>();
  try {
    for (const spec of specs) {
      if (!restored.has(spec.database)) {
        if (spec.database === "AdventureWorks2025") await ensureAdventureWorksRestored(restoreOpts);
        else await ensureWwiRestored(restoreOpts);
        restored.add(spec.database);
      }
      const seed = arg("--seed") ? Number(arg("--seed")) : Math.floor(Math.random() * 2 ** 31);
      ok = (await convertOne(conn, spec, seed, runs)) && ok;
    }
  } finally {
    await conn.mssqlMaster.close();
    await conn.pg.close();
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
