/**
 * CLI: npm run agreed-tests -- --object <Schema.Name> [--object ...] [--recapture]
 *
 * Verification step 2 (ruling 2026-11-12): the object's fixed cases as tSQLt tests on SQL Server and plain-SQL assertion
 * tests on PostgreSQL. For each object:
 *   1. fresh scratch database: spec tables + the original T-SQL (unchanged), as for step 3
 *   2. expected results: read tests/<db>/<obj>.expected.json; if it is missing (or --recapture), capture it from the
 *      original T-SQL. A captured file is new evidence and must be reviewed at step 5.
 *   3. generate tests/<db>/<obj>.tsqlt.sql and tests/<db>/<obj>.pg.sql from the spec and the expected file
 *   4. install the pinned tSQLt (scripts/get-tsqlt.ps1) into the scratch database, deploy the tests, tSQLt.RunAll
 *   5. PostgreSQL: spec tables + the final conversion, then every case of the plain-SQL script
 *   6. each planted defect of the conversion is deployed in turn: report which the agreed tests catch (informational;
 *      the harness gate for planted defects is step 3)
 *   7. pair record: evidence.step2 = pass only if every test on both engines passed; evidence.testsRun lists them
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

import { MssqlClient } from "../harness/clients/mssql-client.js";
import { PgClient } from "../harness/clients/pg-client.js";
import { mssqlEndpoint, pgEndpoint } from "../harness/endpoints.js";
import { ensureAdventureWorksRestored, ensureWwiRestored } from "../harness/restore.js";
import {
  deployPgFunction, fetchSourceCollation, fetchSourceCompatibilityLevel, fetchSourceDefinition, prepareSqlServer, preparePostgres,
  readSql, type Connections,
} from "../harness/generic/run.js";
import { canonicalCell } from "../harness/generic/compare.js";
import { tableKey, type ObjectSpec } from "../harness/generic/spec.js";
import { specByName } from "../conversions/specs.js";
import { autoMutants } from "../conversions/automutants.js";
import {
  pgCases, pgScript, splitBatches, ssCallText, ssInserts, TEST_CLASS, testName, tsqltScript, unsupportedFeatures,
  type ExpectedCase, type ExpectedFile,
} from "../agreed/generate.js";
import type { PairRecord } from "../pairs/schema.js";
import { computeStatus } from "../pairs/status.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

/** Pinned tSQLt (Apache-2.0). scripts/get-tsqlt.ps1 downloads it from tsqlt.org and checks this hash. */
export const TSQLT = {
  version: "V1.0.8083.3529",
  url: "https://tsqlt.org/wp-content/uploads/dlm_uploads/2015/07/tSQLt_V1.0.8083.3529.zip",
  sha256: "af841f357dd9189f8b197c34c5014fe0dbabd3be34b024ed46967dafe13d4f50",
};
const TSQLT_DIR = resolve(ROOT, ".tmp", "tsqlt", TSQLT.version);
const TSQLT_ZIP = resolve(ROOT, ".tmp", "tsqlt", `tSQLt_${TSQLT.version}.zip`);

const envFile = resolve(ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m?.[1] && m[2] !== undefined) process.env[m[1].trim()] = m[2].trim();
  }
}

const argsOf = (name: string): string[] => process.argv.flatMap((a, i) => (a === name && process.argv[i + 1] ? [process.argv[i + 1]] : []));

const errorNumber = (e: unknown): number | undefined =>
  (e as { number?: number }).number ?? (e as { originalError?: { info?: { number?: number } } }).originalError?.info?.number;

function checkTsqlt(): void {
  if (!existsSync(TSQLT_ZIP) || !existsSync(resolve(TSQLT_DIR, "tSQLt.class.sql"))) {
    throw new Error(`tSQLt ${TSQLT.version} is not downloaded. Run: pwsh scripts/get-tsqlt.ps1`);
  }
  const hash = createHash("sha256").update(readFileSync(TSQLT_ZIP)).digest("hex");
  if (hash !== TSQLT.sha256) throw new Error(`tSQLt zip hash mismatch: ${hash}, pinned ${TSQLT.sha256}. Delete .tmp/tsqlt and rerun scripts/get-tsqlt.ps1.`);
}

async function runBatches(client: MssqlClient, script: string, what: string): Promise<void> {
  for (const b of splitBatches(script)) {
    try {
      await client.query(b, []);
    } catch (e) {
      throw new Error(`${what}: ${(e as Error).message}\n  batch: ${b.slice(0, 200)}`);
    }
  }
}

async function clearSs(scratch: MssqlClient, spec: ObjectSpec): Promise<void> {
  for (const t of spec.tables) await scratch.query(`DELETE FROM [${t.schema}].[${t.name}]`, []);
}

/** Expected results from the ORIGINAL T-SQL: the same literal rows and call text the tSQLt tests use. */
async function capture(scratch: MssqlClient, spec: ObjectSpec): Promise<ExpectedFile> {
  const cases: ExpectedCase[] = [];
  for (const fc of spec.fixedCases ?? []) {
    await clearSs(scratch, spec);
    for (const ins of ssInserts(spec, fc)) await scratch.query(ins, []);
    const call = ssCallText(spec, fc);
    if (spec.stateCheck) {
      const sc = spec.stateCheck;
      let outcome = "completed";
      try {
        await scratch.query(call, []);
      } catch (e) {
        const num = errorNumber(e);
        const cls = sc.errorClasses?.find((c) => num !== undefined && c.sqlServer.includes(num));
        if (cls) outcome = `raised: ${cls.label}`;
        else if (num !== undefined && sc.sqlServerErrors.includes(num)) outcome = "raised";
        else throw e;
      }
      const tables: ExpectedCase["tables"] = {};
      for (const key of sc.tables) {
        const t = spec.tables.find((x) => tableKey(x) === key)!;
        const cols = t.columns.map((c) => c.name);
        const pk = t.columns.filter((c) => c.role === "pk").map((c) => `[${c.name}]`);
        const rs = await scratch.query(`SELECT ${cols.map((c) => `[${c}]`).join(", ")} FROM [${t.schema}].[${t.name}]${pk.length ? ` ORDER BY ${pk.join(", ")}` : ""}`, []);
        tables[key] = { columns: cols, rows: rs.rows.map((r) => r.map((v, i) => canonicalCell(v, rs.columns[i].declaredType))) };
      }
      cases.push({ label: fc.label, outcome, tables });
    } else {
      const d = await scratch.query(
        `SELECT name, system_type_name, error_message FROM sys.dm_exec_describe_first_result_set(N'${call.replace(/'/g, "''")}', NULL, 0) WHERE ISNULL(is_hidden, 0) = 0 ORDER BY column_ordinal`, []
      );
      const describeError = d.rows.find((r) => r[2] !== null)?.[2];
      if (describeError || !d.rows.length) throw new Error(`${spec.name}: SQL Server could not describe the result of: ${call}${describeError ? ` (${String(describeError)})` : ""}`);
      const columns = d.rows.map((r) => ({ name: String(r[0]), sqlServerType: String(r[1]) }));
      const rs = await scratch.query(call, []);
      const names = rs.columns.map((c) => c.name);
      if (names.join("\u0001") !== columns.map((c) => c.name).join("\u0001")) {
        throw new Error(`${spec.name}: described columns ${JSON.stringify(columns.map((c) => c.name))} differ from returned ${JSON.stringify(names)}`);
      }
      cases.push({ label: fc.label, columns, rows: rs.rows.map((r) => r.map((v, i) => canonicalCell(v, rs.columns[i].declaredType))) });
    }
  }
  await clearSs(scratch, spec);
  return {
    object: `${spec.schema}.${spec.name}`,
    database: spec.database,
    capturedFrom: "the original T-SQL object, deployed unchanged to a scratch SQL Server database with the fixed case's rows",
    capturedAt: new Date().toISOString(),
    review:
      "Captured from the source engine, not derived independently. A reviewer checks each case's expected values against its label " +
      "at step 5 (second review). Values are canonical: n: number, s: text, b: bit, d: date, t: timestamp (microseconds), x: bytes (hex), ∅: NULL.",
    cases,
  };
}

interface Outcome {
  tests: Array<{ engine: "SQL Server" | "PostgreSQL"; name: string; passed: boolean; message?: string }>;
  defects: { caught: string[]; missed: string[]; skipped: string[] };
}

async function runOne(conn: Connections, spec: ObjectSpec, recapture: boolean): Promise<Outcome> {
  const label = `${spec.schema}.${spec.name}`;
  const unsupported = unsupportedFeatures(spec);
  if (unsupported.length) throw new Error(`${label}: agreed tests cannot be generated yet (${unsupported.join("; ")})`);
  console.log(`\n=== ${label}: agreed tests (step 2) ===`);

  const source = new MssqlClient({ ...mssqlEndpoint(), user: "sa", password: conn.saPassword, database: spec.database });
  let definition: string, collation: string, compat: number;
  try {
    definition = await fetchSourceDefinition(source, spec);
    collation = await fetchSourceCollation(source);
    compat = await fetchSourceCompatibilityLevel(source);
  } finally {
    await source.close();
  }
  const scratch = await prepareSqlServer(conn, spec, definition, collation, compat);
  const testsDir = resolve(ROOT, "tests", spec.database);
  mkdirSync(testsDir, { recursive: true });
  const expectedPath = resolve(testsDir, `${label}.expected.json`);
  const out: Outcome = { tests: [], defects: { caught: [], missed: [], skipped: [] } };
  try {
    let expected: ExpectedFile;
    if (!existsSync(expectedPath) || recapture) {
      expected = await capture(scratch, spec);
      writeFileSync(expectedPath, JSON.stringify(expected, null, 2) + "\n", "utf-8");
      console.log(`expected results CAPTURED from the original T-SQL: tests/${spec.database}/${label}.expected.json (review at step 5)`);
    } else {
      expected = JSON.parse(readFileSync(expectedPath, "utf-8")) as ExpectedFile;
      console.log(`expected results: tests/${spec.database}/${label}.expected.json (committed)`);
    }
    const tsqlt = tsqltScript(spec, expected);
    const pgSql = pgScript(spec, expected);
    writeFileSync(resolve(testsDir, `${label}.tsqlt.sql`), tsqlt, "utf-8");
    writeFileSync(resolve(testsDir, `${label}.pg.sql`), pgSql, "utf-8");

    // ── SQL Server: tSQLt ──
    await runBatches(scratch, readFileSync(resolve(TSQLT_DIR, "tSQLt.class.sql"), "utf-8"), "tSQLt install");
    await runBatches(scratch, tsqlt, "agreed tests (tSQLt) deploy");
    try {
      await scratch.query(`EXEC tSQLt.RunAll;`, []);
    } catch {
      // RunAll raises when any test fails or errors; the results table says which
    }
    const rs = await scratch.query(`SELECT TestCase, Result, Msg FROM tSQLt.TestResult WHERE Class = N'${TEST_CLASS}' ORDER BY TestCase`, []);
    const expectedNames = (spec.fixedCases ?? []).map((fc, i) => testName(i, fc.label));
    for (const n of expectedNames) {
      const row = rs.rows.find((r) => r[0] === n);
      const passed = row?.[1] === "Success";
      out.tests.push({ engine: "SQL Server", name: n, passed, message: passed ? undefined : row ? `${row[1]}: ${String(row[2] ?? "")}` : "did not run" });
    }

    // ── PostgreSQL: plain SQL ──
    await preparePostgres(conn, spec);
    const finalSql = readSql(resolve(ROOT, "conversions", spec.database, `${label}.sql`));
    await deployPgFunction(conn, spec, finalSql);
    const runPg = async (): Promise<Array<{ name: string; passed: boolean; message?: string }>> => {
      const results: Array<{ name: string; passed: boolean; message?: string }> = [];
      for (const [i, c] of pgCases(pgSql).entries()) {
        try {
          await conn.pg.query(c.sql, []);
          results.push({ name: testName(i, c.label), passed: true });
        } catch (e) {
          await conn.pg.query("ROLLBACK", []).catch(() => undefined);
          results.push({ name: testName(i, c.label), passed: false, message: (e as Error).message });
        }
      }
      return results;
    };
    for (const r of await runPg()) out.tests.push({ engine: "PostgreSQL", ...r });

    // ── planted defects: do the agreed tests notice them? (the real function name is replaced, then restored) ──
    const code = finalSql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    const mutants = spec.mutants.length ? spec.mutants : autoMutants(finalSql);
    for (const m of mutants) {
      if (!code.includes(m.from)) { out.defects.skipped.push(m.name); continue; }
      try {
        await deployPgFunction(conn, spec, code.replace(m.from, () => m.to));
      } catch {
        out.defects.skipped.push(m.name);
        continue;
      }
      const r = await runPg();
      (r.some((x) => !x.passed) ? out.defects.caught : out.defects.missed).push(m.name);
    }
    await deployPgFunction(conn, spec, finalSql);
  } finally {
    await scratch.close();
  }

  for (const t of out.tests) console.log(`${t.engine}: ${t.name}: ${t.passed ? "pass" : `FAIL — ${t.message}`}`);
  const total = out.defects.caught.length + out.defects.missed.length;
  console.log(`planted defects caught by the agreed tests: ${out.defects.caught.length} of ${total}` +
    (out.defects.missed.length ? ` (not caught: ${out.defects.missed.join("; ")})` : "") +
    (out.defects.skipped.length ? ` (not deployable, skipped: ${out.defects.skipped.join("; ")})` : ""));
  recordStep2(spec, out);
  return out;
}

function recordStep2(spec: ObjectSpec, out: Outcome): void {
  const label = `${spec.schema}.${spec.name}`;
  const pairPath = resolve(ROOT, "pairs", spec.database, `${label}.json`);
  if (!existsSync(pairPath)) throw new Error(`no pair record for ${label}; run npm run convert -- --object ${label} first`);
  const record = JSON.parse(readFileSync(pairPath, "utf-8")) as PairRecord;
  const passed = out.tests.length > 0 && out.tests.every((t) => t.passed);
  const total = out.defects.caught.length + out.defects.missed.length;
  record.evidence.step2 = passed ? "pass" : "fail";
  record.evidence.testsRun = [
    `tSQLt ${TSQLT.version} on SQL Server (tests/${spec.database}/${label}.tsqlt.sql); plain-SQL assertions on PostgreSQL (tests/${spec.database}/${label}.pg.sql); expected results tests/${spec.database}/${label}.expected.json`,
    ...out.tests.map((t) => `${t.engine}: ${TEST_CLASS}.[${t.name}]: ${t.passed ? "pass" : "fail"}`),
    `planted defects caught by the agreed tests: ${out.defects.caught.length} of ${total}`,
  ];
  record.status = computeStatus(record.evidence);
  writeFileSync(pairPath, JSON.stringify(record, null, 2) + "\n", "utf-8");
  console.log(`pair record updated: pairs/${spec.database}/${label}.json (step2 ${record.evidence.step2}, status ${record.status})`);
}

async function main(): Promise<void> {
  const sa = process.env["MSSQL_SA_PASSWORD"];
  const pgPw = process.env["PG_PASSWORD"];
  if (!sa || !pgPw) throw new Error("MSSQL_SA_PASSWORD and PG_PASSWORD must be set (.env)");
  const names = argsOf("--object");
  const specs = names.map((n) => {
    const s = specByName(n);
    if (!s) throw new Error(`unknown object ${n}`);
    return s;
  });
  if (!specs.length) throw new Error("Usage: agreed-tests --object <Schema.Name> [--object ...] [--recapture]");
  checkTsqlt();

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
  let ok = true;
  try {
    // server-level prerequisites for the tSQLt CLR assembly (idempotent)
    await runBatches(conn.mssqlMaster, readFileSync(resolve(TSQLT_DIR, "PrepareServer.sql"), "utf-8"), "tSQLt PrepareServer");
    const restored = new Set<string>();
    for (const spec of specs) {
      if (!restored.has(spec.database)) {
        if (spec.database === "AdventureWorks2025") await ensureAdventureWorksRestored(restoreOpts);
        else await ensureWwiRestored(restoreOpts);
        restored.add(spec.database);
      }
      const r = await runOne(conn, spec, process.argv.includes("--recapture"));
      ok = r.tests.every((t) => t.passed) && ok;
    }
  } finally {
    await conn.mssqlMaster.close();
    await conn.pg.close();
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
