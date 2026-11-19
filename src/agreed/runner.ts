/** The step-2 runner: expected results from the original T-SQL, tSQLt on SQL Server, plain SQL on PostgreSQL, planted defects. Used by agreed-tests and the adversarial CLI. */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

import { MssqlClient } from "../harness/clients/mssql-client.js";
import { mssqlEndpoint } from "../harness/endpoints.js";
import {
  deployPgFunction, fetchSourceCollation, fetchSourceCompatibilityLevel, fetchSourceDefinition, prepareSqlServer, preparePostgres,
  readSql, type Connections,
} from "../harness/generic/run.js";
import { canonicalCell } from "../harness/generic/compare.js";
import { tableKey, type ObjectSpec } from "../harness/generic/spec.js";
import { specByName } from "../conversions/specs.js";
import { autoMutants } from "../conversions/automutants.js";
import {
  caseSetup, caseTeardown, pgCases, pgScript, splitBatches, ssCallText, ssClientScript, ssInserts, TEST_CLASS, testName, tsqltScript, unsupportedFeatures,
  type ExpectedCase, type ExpectedFile,
} from "./generate.js";
import { corruptExpected } from "./controls.js";
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
export const TSQLT_DIR = resolve(ROOT, ".tmp", "tsqlt", TSQLT.version);
const TSQLT_ZIP = resolve(ROOT, ".tmp", "tsqlt", `tSQLt_${TSQLT.version}.zip`);

const errorNumber = (e: unknown): number | undefined =>
  (e as { number?: number }).number ?? (e as { originalError?: { info?: { number?: number } } }).originalError?.info?.number;

export function checkTsqlt(): void {
  if (!existsSync(TSQLT_ZIP) || !existsSync(resolve(TSQLT_DIR, "tSQLt.class.sql"))) {
    throw new Error(`tSQLt ${TSQLT.version} is not downloaded. Run: pwsh scripts/get-tsqlt.ps1`);
  }
  const hash = createHash("sha256").update(readFileSync(TSQLT_ZIP)).digest("hex");
  if (hash !== TSQLT.sha256) throw new Error(`tSQLt zip hash mismatch: ${hash}, pinned ${TSQLT.sha256}. Delete .tmp/tsqlt and rerun scripts/get-tsqlt.ps1.`);
}

export async function runBatches(client: MssqlClient, script: string, what: string): Promise<void> {
  for (const b of splitBatches(script)) {
    try {
      await client.query(b, []);
    } catch (e) {
      throw new Error(`${what}: ${(e as Error).message}\n  batch: ${b.slice(0, 200)}`);
    }
  }
}

export async function clearSs(scratch: MssqlClient, spec: ObjectSpec): Promise<void> {
  for (const t of spec.tables.filter((x) => !x.tvp)) await scratch.query(`DELETE FROM [${t.schema}].[${t.name}]`, []);
}

/** Expected results from the ORIGINAL T-SQL: the same literal rows and call text the tSQLt tests use. */
export async function capture(scratch: MssqlClient, spec: ObjectSpec, invalid?: InvalidCase[]): Promise<ExpectedFile> {
  const cases: ExpectedCase[] = [];
  // with `invalid`, a case whose original T-SQL raises an undeclared error is recorded there and left out (adversarial mode)
  for (const [caseIndex, fc] of (spec.fixedCases ?? []).entries()) {
    const before = cases.length;
    try {
    await clearSs(scratch, spec);
    for (const ins of ssInserts(spec, fc)) await scratch.query(ins, []);
    for (const s of caseSetup(spec, fc).sqlServer) await scratch.query(s, []);
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
      const queries: NonNullable<ExpectedCase["queries"]> = [];
      for (const q of sc.queries ?? []) {
        const d = await scratch.query(
          `SELECT name, system_type_name, error_message FROM sys.dm_exec_describe_first_result_set(N'${q.sqlServer.replace(/'/g, "''")}', NULL, 0) WHERE ISNULL(is_hidden, 0) = 0 ORDER BY column_ordinal`, []
        );
        const describeError = d.rows.find((r) => r[2] !== null)?.[2];
        if (describeError || !d.rows.length) throw new Error(`${spec.name}: SQL Server could not describe the state query "${q.label}"${describeError ? ` (${String(describeError)})` : ""}`);
        const rs = await scratch.query(q.sqlServer, []);
        queries.push({
          label: q.label,
          columns: d.rows.map((r) => ({ name: String(r[0]), sqlServerType: String(r[1]) })),
          rows: rs.rows.map((r) => r.map((v, i) => canonicalCell(v, rs.columns[i].declaredType))),
        });
      }
      for (const s of caseTeardown(spec, fc)) await scratch.query(s, []);
      cases.push({ label: fc.label, outcome, tables, ...(queries.length ? { queries } : {}) });
    } else {
      const d = await scratch.query(
        `SELECT name, system_type_name, error_message FROM sys.dm_exec_describe_first_result_set(N'${call.replace(/'/g, "''")}', NULL, 0) WHERE ISNULL(is_hidden, 0) = 0 ORDER BY column_ordinal`, []
      );
      const describeError = d.rows.find((r) => r[2] !== null)?.[2];
      if (describeError || !d.rows.length) throw new Error(`${spec.name}: SQL Server could not describe the result of: ${call}${describeError ? ` (${String(describeError)})` : ""}`);
      const columns = d.rows.map((r) => ({ name: String(r[0]), sqlServerType: String(r[1]) }));
      let rs;
      try {
        rs = await scratch.query(call, []);
      } catch (e) {
        // a declared result error is this case's outcome (as in step 3); any other error stops the capture
        const num = errorNumber(e);
        const cls = spec.resultErrorClasses?.find((c) => num !== undefined && c.sqlServer.includes(num));
        if (!cls) throw e;
        cases.push({ label: fc.label, columns, raised: `raised: ${cls.label}` });
        continue;
      }
      if (spec.forJsonChunks) {
        // FOR JSON streams the document as chunk rows of one column; joined in arrival order, as the harness does
        const text = rs.rows.length ? rs.rows.map((r) => String(r[0] ?? "")).join("") : null;
        cases.push({ label: fc.label, columns: [{ name: "result", sqlServerType: "nvarchar(max)" }], rows: [[text === null ? "∅" : `s:${text}`]] });
        continue;
      }
      const names = rs.columns.map((c) => c.name);
      if (names.join("\u0001") !== columns.map((c) => c.name).join("\u0001")) {
        throw new Error(`${spec.name}: described columns ${JSON.stringify(columns.map((c) => c.name))} differ from returned ${JSON.stringify(names)}`);
      }
      cases.push({ label: fc.label, columns, rows: rs.rows.map((r) => r.map((v, i) => canonicalCell(v, rs.columns[i].declaredType))) });
    }
    } catch (e) {
      if (!invalid) throw e;
      cases.length = before;
      invalid.push({ index: caseIndex, label: fc.label, reason: `the original T-SQL raised an undeclared error: ${(e as Error).message}` });
      for (const s of caseTeardown(spec, fc)) await scratch.query(s, []).catch(() => undefined);
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

export interface InvalidCase { index: number; label: string; reason: string }

export interface Outcome {
  /** `caseIndex` is the index in the cases passed in (invalid cases included), so callers can map a test back to its case. */
  tests: Array<{ engine: "SQL Server" | "PostgreSQL"; name: string; passed: boolean; message?: string; caseIndex?: number }>;
  defects: { caught: string[]; missed: string[]; skipped: string[] };
  /** Cases the original T-SQL could not run (only when `RunOptions.tolerateInvalid`); they are not tested. */
  invalid?: InvalidCase[];
}

export interface RunOptions {
  recapture?: boolean;
  control?: boolean;
  controlColumn?: string;
  /** "" for the agreed tests, ".adversarial" for the adversarial cases: part of every file name under tests/. */
  fileTag?: "" | ".adversarial";
  /** false: do not touch the pair record. Default true. */
  record?: boolean;
  /** First line of every generated script. */
  banner?: string;
  /** Record a case whose original T-SQL raises an undeclared error as invalid and continue, instead of stopping. */
  tolerateInvalid?: boolean;
  /** Where the generated scripts and the expected file go. Default tests/<database>. */
  testsDir?: string;
  /** Deploy this PL/pgSQL instead of conversions/<db>/<object>.sql (harness checks). */
  finalSql?: string;
}

export async function runOne(conn: Connections, spec: ObjectSpec, opts: RunOptions = {}): Promise<Outcome & { control?: string; controlCase?: number }> {
  const { recapture = false, control = false, controlColumn, fileTag = "", record = true, banner, tolerateInvalid = false } = opts;
  const label = `${spec.schema}.${spec.name}`;
  const unsupported = unsupportedFeatures(spec);
  if (unsupported.length) throw new Error(`${label}: agreed tests cannot be generated yet (${unsupported.join("; ")})`);
  console.log(`\n=== ${label}: agreed tests (step 2) ===`);

  const source = new MssqlClient({ ...mssqlEndpoint(), user: "sa", password: conn.saPassword, database: spec.database });
  let definition: string, collation: string, compat: number;
  // dependencies: SQL Server gets the original definition, PostgreSQL the dependency's own (separately verified) conversion
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
  const scratch = await prepareSqlServer(conn, spec, definition, collation, compat, dependencyDefinitions);
  const testsDir = opts.testsDir ?? resolve(ROOT, "tests", spec.database);
  mkdirSync(testsDir, { recursive: true });
  const expectedPath = resolve(testsDir, `${label}${fileTag}.expected.json`);
  const out: Outcome & { control?: string; controlCase?: number } = { tests: [], defects: { caught: [], missed: [], skipped: [] } };
  const allCases = spec.fixedCases ?? [];
  // original index of each case that is tested (all of them unless some are invalid)
  let tested: number[] = allCases.map((_, i) => i);
  try {
    let expected: ExpectedFile;
    if (control) {
      if (!existsSync(expectedPath)) throw new Error(`${label}: --negative-control needs the committed tests/${spec.database}/${label}.expected.json; run agreed-tests without it first`);
      const corrupted = corruptExpected(JSON.parse(readFileSync(expectedPath, "utf-8")) as ExpectedFile, controlColumn);
      expected = corrupted.file;
      out.control = corrupted.what;
      out.controlCase = corrupted.caseIndex;
      console.log(`NEGATIVE CONTROL: ${corrupted.what} (in memory only; tests/ and the pair record are not changed)`);
    } else if (!existsSync(expectedPath) || recapture) {
      const invalid: InvalidCase[] = [];
      expected = await capture(scratch, spec, tolerateInvalid ? invalid : undefined);
      if (invalid.length) {
        out.invalid = invalid;
        const bad = new Set(invalid.map((x) => x.index));
        tested = tested.filter((i) => !bad.has(i));
        spec = { ...spec, fixedCases: tested.map((i) => allCases[i]) };
        for (const x of invalid) console.log(`INVALID case ${x.label}: ${x.reason}`);
      }
      writeFileSync(expectedPath, JSON.stringify(expected, null, 2) + "\n", "utf-8");
      console.log(`expected results CAPTURED from the original T-SQL: tests/${spec.database}/${label}${fileTag}.expected.json (review at step 5)`);
    } else {
      expected = JSON.parse(readFileSync(expectedPath, "utf-8")) as ExpectedFile;
      console.log(`expected results: tests/${spec.database}/${label}${fileTag}.expected.json (committed)`);
    }
    if (tested.length === 0) {
      console.log(`${label}: no case could run on the original T-SQL; nothing to test`);
      return out;
    }
    const pgSql = pgScript(spec, expected, banner);
    if (spec.forJsonChunks) {
      // ── SQL Server: client re-run (ruling J1, 2026-11-18; not tSQLt) ──
      // No tSQLt test can observe a FOR JSON procedure's result (INSERT ... EXEC is refused, also via ResultSetFilter,
      // error 6549). Each fixed case is loaded and the ORIGINAL procedure called through the client, its chunks joined,
      // and the document compared exactly with the committed expected one.
      if (!control) {
        writeFileSync(resolve(testsDir, `${label}${fileTag}.sqlserver.sql`), ssClientScript(spec, expected, banner), "utf-8");
        writeFileSync(resolve(testsDir, `${label}${fileTag}.pg.sql`), pgSql, "utf-8");
      }
      for (const [i, fc] of (spec.fixedCases ?? []).entries()) {
        await clearSs(scratch, spec);
        for (const ins of ssInserts(spec, fc)) await scratch.query(ins, []);
        const rs = await scratch.query(ssCallText(spec, fc), []);
        const got = rs.rows.length ? `s:${rs.rows.map((r) => String(r[0] ?? "")).join("")}` : "∅";
        const want = expected.cases[i]?.rows?.[0]?.[0] ?? "∅";
        const passed = got === want;
        out.tests.push({
          engine: "SQL Server", name: testName(i, fc.label), passed, caseIndex: tested[i],
          message: passed ? undefined : `Failure: the JSON document differs (client re-run, not tSQLt): expected ${want.slice(0, 120)}, got ${got.slice(0, 120)}`,
        });
      }
      await clearSs(scratch, spec);
    } else {
    const tsqlt = tsqltScript(spec, expected, { schemaBound: /\bWITH\s+SCHEMABINDING\b/i.test(definition), banner });
    if (!control) {
      writeFileSync(resolve(testsDir, `${label}${fileTag}.tsqlt.sql`), tsqlt, "utf-8");
      writeFileSync(resolve(testsDir, `${label}${fileTag}.pg.sql`), pgSql, "utf-8");
    }

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
      out.tests.push({ engine: "SQL Server", name: n, passed, caseIndex: tested[expectedNames.indexOf(n)], message: passed ? undefined : row ? `${row[1]}: ${String(row[2] ?? "")}` : "did not run" });
    }
    }

    // ── PostgreSQL: plain SQL ──
    await preparePostgres(conn, spec);
    for (const dep of spec.dependencies ?? []) {
      const depSpec = specByName(dep);
      if (!depSpec) throw new Error(`${label} depends on ${dep}, which has no spec`);
      await deployPgFunction(conn, depSpec, readSql(resolve(ROOT, "conversions", spec.database, `${dep}.sql`)));
    }
    const finalSql = opts.finalSql ?? readSql(resolve(ROOT, "conversions", spec.database, `${label}.sql`));
    await deployPgFunction(conn, spec, finalSql);
    const runPg = async (): Promise<Array<{ name: string; passed: boolean; message?: string; caseIndex: number }>> => {
      const results: Array<{ name: string; passed: boolean; message?: string; caseIndex: number }> = [];
      for (const [i, c] of pgCases(pgSql).entries()) {
        try {
          await conn.pg.query(c.sql, []);
          results.push({ name: testName(i, c.label), passed: true, caseIndex: tested[i] });
        } catch (e) {
          await conn.pg.query("ROLLBACK", []).catch(() => undefined);
          results.push({ name: testName(i, c.label), passed: false, message: (e as Error).message, caseIndex: tested[i] });
        }
      }
      return results;
    };
    for (const r of await runPg()) out.tests.push({ engine: "PostgreSQL", ...r });

    // ── planted defects: do the agreed tests notice them? (the real function name is replaced, then restored) ──
    const code = finalSql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    const mutants = control ? [] : spec.mutants.length ? spec.mutants : autoMutants(finalSql);
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
  if (control) return out;   // a control never records step 2
  const total = out.defects.caught.length + out.defects.missed.length;
  console.log(`planted defects caught by the agreed tests: ${out.defects.caught.length} of ${total}` +
    (out.defects.missed.length ? ` (not caught: ${out.defects.missed.join("; ")})` : "") +
    (out.defects.skipped.length ? ` (not deployable, skipped: ${out.defects.skipped.join("; ")})` : ""));
  if (record) recordStep2(spec, out);
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
    spec.forJsonChunks
      ? `SQL Server: NOT tSQLt (ruling J1, 2026-11-18: no tSQLt test can observe a FOR JSON procedure's result) — each fixed case loaded and the original procedure re-run through the client, its document compared exactly with the expected one (tests/${spec.database}/${label}.sqlserver.sql); plain-SQL assertions on PostgreSQL, compared as jsonb (tests/${spec.database}/${label}.pg.sql); expected results tests/${spec.database}/${label}.expected.json`
      : `tSQLt ${TSQLT.version} on SQL Server (tests/${spec.database}/${label}.tsqlt.sql); plain-SQL assertions on PostgreSQL (tests/${spec.database}/${label}.pg.sql); expected results tests/${spec.database}/${label}.expected.json`,
    ...out.tests.map((t) => `${spec.forJsonChunks && t.engine === "SQL Server" ? "SQL Server (client re-run, not tSQLt)" : t.engine}: ${TEST_CLASS}.[${t.name}]: ${t.passed ? "pass" : "fail"}`),
    `planted defects caught by the agreed tests: ${out.defects.caught.length} of ${total}`,
  ];
  record.status = computeStatus(record.evidence);
  writeFileSync(pairPath, JSON.stringify(record, null, 2) + "\n", "utf-8");
  console.log(`pair record updated: pairs/${spec.database}/${label}.json (step2 ${record.evidence.step2}, status ${record.status})`);
}


