/**
 * Verification step 2, "agreed tests" (ruling 2026-11-12): tSQLt on SQL Server, plain-SQL assertions on PostgreSQL.
 *
 * The agreed tests are an object's hand-derived fixed cases (ObjectSpec.fixedCases). Their expected results are captured
 * once from the ORIGINAL T-SQL on SQL Server and committed (tests/<db>/<Schema.Name>.expected.json), so a reviewer can read
 * them next to each case's label at step 5. This module turns a spec plus that file into two committed test scripts:
 *
 *   tests/<db>/<Schema.Name>.tsqlt.sql  one tSQLt test class (AgreedTests), one test per case
 *   tests/<db>/<Schema.Name>.pg.sql     one transaction per case; raises on any difference, always rolls back
 *
 * Values travel through the canonical form used by the step 3 comparison (compare.ts canonicalCell), so both scripts state
 * the same expected values: microsecond timestamps, exact decimals as written, bytes as hex.
 *
 * Neither script checks row ORDER: tSQLt.AssertEqualsTable and EXCEPT ALL compare multisets. Order is part of step 3.
 */

import type { ColSpec, ColType, FixedCase, ObjectSpec, Row, TableSpec } from "../harness/generic/spec.js";
import { pgTableName, tableKey } from "../harness/generic/spec.js";

export const TEST_CLASS = "AgreedTests";

export interface ExpectedColumn {
  name: string;
  /** SQL Server type of the result column (sys.dm_exec_describe_first_result_set), used to declare #Actual. */
  sqlServerType: string;
}

export interface ExpectedCase {
  label: string;
  /** Result-set objects: the columns and rows the original T-SQL returned (canonical cells). */
  columns?: ExpectedColumn[];
  rows?: string[][];
  /** State objects: "completed", "raised" or "raised: <class>", and every row of each stateCheck table afterwards. */
  outcome?: string;
  tables?: Record<string, { columns: string[]; rows: string[][] }>;
}

export interface ExpectedFile {
  object: string;
  database: string;
  capturedFrom: string;
  capturedAt: string;
  review: string;
  cases: ExpectedCase[];
}

// ── canonical cells ─────────────────────────────────────────────────────────────────────────────

/** A fixed-case input value (as written in the spec) in canonical form, by the column's declared type. */
export function inputCell(value: unknown, type: ColType): string {
  if (value === null || value === undefined) return "∅";
  if (value instanceof Uint8Array) return `x:${Buffer.from(value).toString("hex")}`;
  switch (type.kind) {
    case "bit":
      if (typeof value === "boolean") return `b:${value ? 1 : 0}`;
      if (value === 0 || value === 1) return `b:${value}`;
      break;
    case "int": case "tinyint": case "smallint": case "bigint": case "decimal": case "money":
      if (typeof value === "number" && Number.isFinite(value)) return `n:${Object.is(value, -0) ? 0 : value}`;
      if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) return `n:${value}`;
      break;
    case "date":
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return `d:${value}`;
      break;
    case "datetime": case "datetime2":
      if (typeof value === "string") {
        const m = value.replace(" ", "T").match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/);
        if (m) return `t:${m[1]}.${(m[2] ?? "").padEnd(6, "0")}`;
      }
      break;
    case "nvarchar": case "char":
      if (typeof value === "string") return `s:${value}`;
      break;
    case "varbinary":
      break;   // only bytes (handled above) are valid
    case "geography": case "xml":
      throw new Error(`agreed tests: ${type.kind} values are not supported yet`);
  }
  throw new Error(`agreed tests: cannot use ${JSON.stringify(value)} as a ${type.kind} value`);
}

const SUPPORTED_OUTPUT = /^(∅|[nbsdtx]:)/;

/** A canonical cell as a SQL Server literal. */
export function ssLiteral(cell: string): string {
  if (cell === "∅") return "NULL";
  if (!SUPPORTED_OUTPUT.test(cell)) throw new Error(`agreed tests: unsupported value ${cell}`);
  const v = cell.slice(2);
  switch (cell[0]) {
    case "n": return v;
    case "b": return v;
    case "s": return `N'${v.replace(/'/g, "''")}'`;
    case "d": return `CAST('${v}' AS date)`;
    // via datetime2(7) so that 6 fractional digits are accepted for datetime columns too (the value converts on insert)
    case "t": return `CAST('${v}' AS datetime2(7))`;
    case "x": return `0x${v}`;
  }
  throw new Error(`agreed tests: unsupported value ${cell}`);
}

/**
 * A canonical cell as a SQL Server call argument. EXEC accepts only constants and variables (no CAST), so dates and
 * timestamps are string constants that convert to the parameter's type. Trailing zero digits beyond milliseconds are
 * dropped so that a datetime parameter accepts the string as well.
 */
export function ssArgLiteral(cell: string): string {
  if (cell.startsWith("d:")) return `'${cell.slice(2)}'`;
  if (cell.startsWith("t:")) return `'${cell.slice(2).replace(/^(.*\.\d{3})000$/, "$1")}'`;
  return ssLiteral(cell);
}

/** A canonical cell as a PostgreSQL literal: quoted, so it takes the column's (or the cast's) type. */
export function pgLiteral(cell: string): string {
  if (cell === "∅") return "NULL";
  if (!SUPPORTED_OUTPUT.test(cell)) throw new Error(`agreed tests: unsupported value ${cell}`);
  const v = cell.slice(2);
  switch (cell[0]) {
    case "n": case "b": case "d": return `'${v}'`;
    case "s": return `'${v.replace(/'/g, "''")}'`;
    case "t": return `'${v.replace("T", " ")}'`;
    case "x": return `'\\x${v}'`;
  }
  throw new Error(`agreed tests: unsupported value ${cell}`);
}

// ── shared pieces ───────────────────────────────────────────────────────────────────────────────

const ssName = (s: string): string => `[${s.replace(/]/g, "]]")}]`;
const pgName = (s: string): string => `"${s.replace(/"/g, '""')}"`;
const pgString = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/** What the agreed-test generator cannot express yet. Checked before anything is generated or run. */
export function unsupportedFeatures(spec: ObjectSpec): string[] {
  const out: string[] = [];
  if (!spec.fixedCases?.length) out.push("no fixed cases (the agreed tests are the fixed cases)");
  if (spec.tables.some((t) => t.tvp)) out.push("table-valued parameters");
  if (spec.forJsonChunks || spec.jsonColumns?.length) out.push("JSON results");
  if (spec.resultErrorClasses?.length) out.push("declared result errors");
  if (spec.sampleSetup || spec.setup) out.push("per-sample or one-off setup statements");
  if (spec.dependencies?.length) out.push("dependencies on other converted objects");
  if (spec.stateCheck?.queries?.length) out.push("state observation queries");
  if (spec.tables.some((t) => t.columns.some((c) => c.identity))) out.push("identity columns");
  if (spec.tables.some((t) => t.memoryOptimized) || spec.memoryOptimizedFilegroup) out.push("memory-optimized tables");
  if (spec.tables.some((t) => t.columns.some((c) => c.type.kind === "geography" || c.type.kind === "xml"))) out.push("geography or xml columns");
  return out;
}

/** Call arguments of a fixed case in canonical form, with their types. */
function caseArgs(spec: ObjectSpec, fc: FixedCase): string[] {
  if (spec.windowParams) {
    if (!fc.cutoffs) throw new Error(`${spec.name}: fixed case "${fc.label}" has no cutoffs`);
    return [inputCell(fc.cutoffs.last, { kind: "datetime2" }), inputCell(fc.cutoffs.new, { kind: "datetime2" })];
  }
  const params: ColSpec[] = spec.params ?? [];
  const args = fc.args ?? [];
  if (args.length !== params.length) throw new Error(`${spec.name}: fixed case "${fc.label}" has ${args.length} arguments, the spec declares ${params.length}`);
  return args.map((a, i) => inputCell(a, params[i].type));
}

/** The SQL Server call with literal arguments. */
export function ssCallText(spec: ObjectSpec, fc: FixedCase): string {
  const call = spec.ssCall ?? (spec.objectClass === "view"
    ? `SELECT * FROM ${spec.schema}.${spec.name}`
    : spec.windowParams ? `EXEC ${spec.schema}.${spec.name} @LastCutoff = ?, @NewCutoff = ?` : `EXEC ${spec.schema}.${spec.name}`);
  const args = caseArgs(spec, fc);
  const parts = call.split("?");
  if (parts.length - 1 !== args.length) throw new Error(`${spec.name}: ssCall has ${parts.length - 1} placeholders, the case has ${args.length} arguments`);
  return parts.reduce((acc, p, i) => acc + (i ? ssArgLiteral(args[i - 1]) : "") + p, "");
}

/** The PostgreSQL call with literal arguments ($n replaced, {fn} = the conversion). */
export function pgCallText(spec: ObjectSpec, fc: FixedCase): string {
  const call = spec.pgCall ?? (spec.objectClass === "view"
    ? "SELECT * FROM {fn}"
    : spec.windowParams ? "SELECT * FROM {fn}($1::timestamp, $2::timestamp)" : "SELECT * FROM {fn}()");
  const args = caseArgs(spec, fc);
  let text = call.replace("{fn}", spec.pgFunction);
  // highest index first, so $1 never matches the start of $10
  for (let i = args.length; i >= 1; i--) text = text.split(`$${i}`).join(pgLiteral(args[i - 1]));
  if (/\$\d/.test(text)) throw new Error(`${spec.name}: pgCall has more placeholders than the case has arguments`);
  return text;
}

/** One INSERT per table per engine for a fixed case's rows (explicit columns, in the spec's column order). */
function inserts(spec: ObjectSpec, fc: FixedCase, engine: "ss" | "pg"): string[] {
  const out: string[] = [];
  for (const t of spec.tables) {
    const rows: Row[] = fc.tables[tableKey(t)] ?? [];
    if (!rows.length) continue;
    const cols = t.columns;
    const values = rows.map((r) => `(${cols.map((c) => {
      const cell = inputCell(r[c.name], c.type);
      return engine === "ss" ? ssLiteral(cell) : pgLiteral(cell);
    }).join(", ")})`);
    const target = engine === "ss" ? `${ssName(t.schema)}.${ssName(t.name)}` : pgTableName(t);
    const names = cols.map((c) => (engine === "ss" ? ssName(c.name) : pgName(c.name))).join(", ");
    out.push(`INSERT INTO ${target} (${names}) VALUES\n  ${values.join(",\n  ")};`);
  }
  return out;
}

/** Literal rows for the SQL Server and PostgreSQL scripts (exported for the capture step, which runs the same text). */
export const ssInserts = (spec: ObjectSpec, fc: FixedCase): string[] => inserts(spec, fc, "ss");

const stateTables = (spec: ObjectSpec): TableSpec[] =>
  (spec.stateCheck?.tables ?? []).map((k) => {
    const t = spec.tables.find((x) => tableKey(x) === k);
    if (!t) throw new Error(`${spec.name}: stateCheck table ${k} is not in the spec`);
    return t;
  });

/** SQL Server error numbers per outcome label (errorClasses first, as in the harness). */
function ssOutcomeCases(spec: ObjectSpec): Array<{ label: string; numbers: number[] }> {
  const sc = spec.stateCheck!;
  return [...(sc.errorClasses ?? []).map((c) => ({ label: `raised: ${c.label}`, numbers: c.sqlServer })), { label: "raised", numbers: sc.sqlServerErrors }];
}

function pgOutcomeCases(spec: ObjectSpec): Array<{ label: string; codes: string[] }> {
  const sc = spec.stateCheck!;
  return [...(sc.errorClasses ?? []).map((c) => ({ label: `raised: ${c.label}`, codes: c.postgres })), { label: "raised", codes: sc.postgresErrors }];
}

/** tSQLt test names: "test NN <label>", trimmed to fit sysname with room to spare. */
export function testName(index: number, label: string): string {
  // quotes are dropped: tSQLt builds dynamic SQL from test names (the full label stays in the script comment)
  const clean = label.replace(/['"]/g, "").replace(/[\]\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  const head = `test ${String(index + 1).padStart(2, "0")} `;
  return head + (clean.length > 110 - head.length ? clean.slice(0, 110 - head.length - 1).trimEnd() + "…" : clean);
}

function checkExpected(spec: ObjectSpec, expected: ExpectedFile): FixedCase[] {
  const cases = spec.fixedCases ?? [];
  if (expected.cases.length !== cases.length || expected.cases.some((c, i) => c.label !== cases[i].label)) {
    throw new Error(
      `${spec.schema}.${spec.name}: tests/${spec.database}/${spec.schema}.${spec.name}.expected.json does not match the spec's fixed cases ` +
      "(labels or count differ). Recapture with --recapture, then review the new expected results."
    );
  }
  return cases;
}

const header = (spec: ObjectSpec, engine: string, extra: string[]): string => [
  `-- Agreed tests (verification step 2, ${engine}) for ${spec.database} ${spec.schema}.${spec.name}.`,
  `-- GENERATED by npm run agreed-tests -- --object ${spec.schema}.${spec.name}. Do not edit by hand: change the fixed cases`,
  `-- in the object's spec, recapture, and review tests/${spec.database}/${spec.schema}.${spec.name}.expected.json.`,
  "-- Expected results were captured from the original T-SQL on SQL Server and are reviewed at step 5.",
  "-- Row order is not asserted here (multiset comparison); step 3 checks order where the source guarantees one.",
  ...extra.map((l) => `-- ${l}`),
].join("\n");

// ── tSQLt ───────────────────────────────────────────────────────────────────────────────────────

/** The tSQLt script: batches separated by GO. Run in the scratch database after tSQLt and the original object are installed. */
export function tsqltScript(spec: ObjectSpec, expected: ExpectedFile): string {
  const cases = checkExpected(spec, expected);
  const batches: string[] = [
    header(spec, "tSQLt on SQL Server", [
      "Prerequisites: tSQLt installed in the database, the spec's tables created, the original T-SQL object deployed unchanged.",
      ...(spec.stateCheck ? [
        "State tests run outside tSQLt's transaction (NoTransaction annotation; tSQLt undoes the FakeTable afterwards), because",
        "a procedure that opens and fails its own transaction would doom tSQLt's. Each test asserts the outcome (completed, or",
        "the declared error) and every row of the changed tables afterwards, as step 3 does.",
      ] : []),
    ]),
    `EXEC tSQLt.NewTestClass '${TEST_CLASS}';`,
  ];
  cases.forEach((fc, i) => {
    const exp = expected.cases[i];
    const body: string[] = [];
    // state tests run outside tSQLt's transaction: a procedure that opens and fails its own transaction (or fails under
    // XACT_ABORT) would otherwise doom it. tSQLt undoes the FakeTable afterwards (UndoTestDoubles).
    const noTransaction = !!spec.stateCheck;
    for (const t of spec.tables) body.push(`EXEC tSQLt.FakeTable @TableName = N'${ssName(t.schema)}.${ssName(t.name)}';`);
    body.push(...ssInserts(spec, fc));
    const call = ssCallText(spec, fc);
    if (spec.stateCheck) {
      const outcome = exp.outcome ?? "";
      stateTables(spec).forEach((t, k) => {
        const st = exp.tables?.[tableKey(t)];
        if (!st) throw new Error(`${spec.name}: expected state for ${tableKey(t)} missing in case "${fc.label}"`);
        const ex = `#ExpectedState${k + 1}`;
        body.push(`SELECT TOP (0) ${st.columns.map(ssName).join(", ")} INTO ${ex} FROM ${ssName(t.schema)}.${ssName(t.name)};`);
        if (st.rows.length) {
          body.push(`INSERT INTO ${ex} (${st.columns.map(ssName).join(", ")}) VALUES\n  ${st.rows.map((r) => `(${r.map(ssLiteral).join(", ")})`).join(",\n  ")};`);
        }
      });
      // the outcome as the harness classifies it: only the declared errors are outcomes, any other error is reported
      const whens = ssOutcomeCases(spec)
        .filter((c) => c.numbers.length)
        .map((c) => `WHEN ERROR_NUMBER() IN (${c.numbers.join(", ")}) THEN N'${c.label.replace(/'/g, "''")}'`);
      body.push(
        "DECLARE @outcome nvarchar(4000) = N'completed';",
        "BEGIN TRY",
        `  ${call};`,
        "END TRY",
        "BEGIN CATCH",
        `  SET @outcome = CASE ${whens.join(" ")} ELSE N'unexpected error ' + CAST(ERROR_NUMBER() AS nvarchar(20)) + N': ' + ERROR_MESSAGE() END;`,
        "  -- a procedure that fails inside its own transaction can leave it open (and uncommittable); the test is outside",
        "  -- tSQLt's transaction (NoTransaction), so this undoes only the procedure's work, as SQL Server does at batch end",
        "  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;",
        "END CATCH;",
        `EXEC tSQLt.AssertEqualsString @Expected = N'${outcome.replace(/'/g, "''")}', @Actual = @outcome, @Message = N'outcome';`,
      );
      stateTables(spec).forEach((t, k) => {
        const st = exp.tables![tableKey(t)];
        body.push(`SELECT ${st.columns.map(ssName).join(", ")} INTO #ActualState${k + 1} FROM ${ssName(t.schema)}.${ssName(t.name)};`);
        body.push(`EXEC tSQLt.AssertEqualsTable @Expected = N'#ExpectedState${k + 1}', @Actual = N'#ActualState${k + 1}', @Message = N'${tableKey(t)} after the call';`);
      });
    } else {
      const cols = exp.columns ?? [];
      if (!cols.length) throw new Error(`${spec.name}: expected columns missing in case "${fc.label}"`);
      const ddl = cols.map((c) => `  ${ssName(c.name)} ${c.sqlServerType} NULL`).join(",\n");
      body.push(`CREATE TABLE #Expected (\n${ddl}\n);`);
      body.push(`CREATE TABLE #Actual (\n${ddl}\n);`);
      const rows = exp.rows ?? [];
      if (rows.length) {
        body.push(`INSERT INTO #Expected (${cols.map((c) => ssName(c.name)).join(", ")}) VALUES\n  ${rows.map((r) => `(${r.map(ssLiteral).join(", ")})`).join(",\n  ")};`);
      }
      body.push(`INSERT INTO #Actual\n${call};`);
      body.push(`EXEC tSQLt.AssertEqualsTable @Expected = N'#Expected', @Actual = N'#Actual';`);
    }
    batches.push(
      `-- case ${i + 1}: ${fc.label}\n${noTransaction ? "--[@tSQLt:NoTransaction](DEFAULT)\n" : ""}CREATE PROCEDURE ${ssName(TEST_CLASS)}.${ssName(testName(i, fc.label))}\nAS\nBEGIN\n` +
      body.map((l) => l.split("\n").map((x) => `  ${x}`).join("\n")).join("\n") +
      "\nEND;"
    );
  });
  return batches.join("\nGO\n") + "\nGO\n";
}

// ── PostgreSQL ──────────────────────────────────────────────────────────────────────────────────

export const PG_CASE_MARKER = "-- @case ";

/** Raise unless two relations hold the same multiset of rows. Both are queries; the message names the case. */
function pgAssertSame(caseLabel: string, what: string, expectedSql: string, actualSql: string): string {
  return [
    "DO $pp$",
    "DECLARE missing bigint; extra bigint;",
    "BEGIN",
    `  SELECT count(*) INTO missing FROM ((${expectedSql}) EXCEPT ALL (${actualSql})) AS d;`,
    `  SELECT count(*) INTO extra FROM ((${actualSql}) EXCEPT ALL (${expectedSql})) AS d;`,
    "  IF missing > 0 OR extra > 0 THEN",
    `    RAISE EXCEPTION 'agreed test failed (%): % expected row(s) missing, % unexpected row(s) in ${what.replace(/'/g, "''").replace(/%/g, "%%")}', ${pgString(caseLabel)}, missing, extra;`,
    "  END IF;",
    "END $pp$;",
  ].join("\n");
}

function pgAssertColumns(caseLabel: string, relation: string, names: string[]): string {
  const expectedArray = `ARRAY[${names.map(pgString).join(", ")}]::text[]`;
  return [
    "DO $pp$",
    "DECLARE got text[];",
    "BEGIN",
    `  SELECT array_agg(attname::text ORDER BY attnum) INTO got FROM pg_attribute WHERE attrelid = '${relation}'::regclass AND attnum > 0 AND NOT attisdropped;`,
    `  IF got IS DISTINCT FROM ${expectedArray} THEN`,
    `    RAISE EXCEPTION 'agreed test failed (%): columns are %, expected %', ${pgString(caseLabel)}, got, ${expectedArray};`,
    "  END IF;",
    "END $pp$;",
  ].join("\n");
}

/**
 * The PostgreSQL script. Each case is one transaction that starts with BEGIN, is marked by a "-- @case N: label" line, and
 * ends with ROLLBACK, so nothing persists. A difference raises an exception whose message starts "agreed test failed".
 * Run after the harness has created the spec's tables and deployed conversions/<db>/<Schema.Name>.sql.
 */
export function pgScript(spec: ObjectSpec, expected: ExpectedFile): string {
  const cases = checkExpected(spec, expected);
  const blocks: string[] = [header(spec, "plain SQL on PostgreSQL", [
    "Prerequisites: the spec's tables created and the final conversion deployed.",
    "Each case is one transaction and always rolls back.",
  ])];
  cases.forEach((fc, i) => {
    const exp = expected.cases[i];
    const name = testName(i, fc.label);
    const lines: string[] = [`${PG_CASE_MARKER}${i + 1}: ${fc.label}`, "BEGIN;"];
    for (const t of spec.tables) lines.push(`DELETE FROM ${pgTableName(t)};`);
    lines.push(...inserts(spec, fc, "pg"));
    const call = pgCallText(spec, fc);
    if (spec.stateCheck) {
      lines.push("CREATE TEMP TABLE pp_outcome (outcome text) ON COMMIT DROP;");
      // only the declared errors are outcomes; any other error propagates and fails the case
      const handlers = pgOutcomeCases(spec)
        .filter((c) => c.codes.length)
        .map((c) => `  WHEN ${c.codes.map((code) => `SQLSTATE '${code}'`).join(" OR ")} THEN INSERT INTO pp_outcome VALUES (${pgString(c.label)});`);
      lines.push([
        "DO $pp$",
        "BEGIN",
        `  ${call};`,
        "  INSERT INTO pp_outcome VALUES ('completed');",
        ...(handlers.length ? ["EXCEPTION", ...handlers] : []),
        "END $pp$;",
      ].join("\n"));
      lines.push(pgAssertSame(name, "the outcome", `SELECT ${pgString(exp.outcome ?? "")}::text AS outcome`, "SELECT outcome FROM pp_outcome"));
      stateTables(spec).forEach((t, k) => {
        const st = exp.tables?.[tableKey(t)];
        if (!st) throw new Error(`${spec.name}: expected state for ${tableKey(t)} missing in case "${fc.label}"`);
        const ex = `pp_expected_state_${k + 1}`;
        const cols = st.columns.map(pgName).join(", ");
        lines.push(`CREATE TEMP TABLE ${ex} ON COMMIT DROP AS SELECT ${cols} FROM ${pgTableName(t)} WITH NO DATA;`);
        if (st.rows.length) lines.push(`INSERT INTO ${ex} (${cols}) VALUES\n  ${st.rows.map((r) => `(${r.map(pgLiteral).join(", ")})`).join(",\n  ")};`);
        lines.push(pgAssertSame(name, `${tableKey(t)} after the call`, `SELECT ${cols} FROM ${ex}`, `SELECT ${cols} FROM ${pgTableName(t)}`));
      });
    } else {
      const cols = exp.columns ?? [];
      lines.push(`CREATE TEMP TABLE pp_actual ON COMMIT DROP AS\n${call};`);
      lines.push(pgAssertColumns(name, "pp_actual", cols.map((c) => c.name)));
      lines.push("CREATE TEMP TABLE pp_expected (LIKE pp_actual) ON COMMIT DROP;");
      const rows = exp.rows ?? [];
      if (rows.length) lines.push(`INSERT INTO pp_expected VALUES\n  ${rows.map((r) => `(${r.map(pgLiteral).join(", ")})`).join(",\n  ")};`);
      lines.push(pgAssertSame(name, "the result", "SELECT * FROM pp_expected", "SELECT * FROM pp_actual"));
    }
    lines.push("ROLLBACK;");
    blocks.push(lines.join("\n"));
  });
  return blocks.join("\n\n") + "\n";
}

/** Split a PostgreSQL agreed-test script into its cases (text from each marker to the next). */
export function pgCases(script: string): Array<{ label: string; sql: string }> {
  const parts = script.split(`\n${PG_CASE_MARKER}`).slice(1);
  return parts.map((p) => {
    const nl = p.indexOf("\n");
    return { label: p.slice(0, nl).replace(/^\d+:\s*/, ""), sql: p.slice(nl + 1) };
  });
}

/** Split a T-SQL script into batches on lines that are just GO. */
export function splitBatches(script: string): string[] {
  const commentOnly = (b: string): boolean => b.split("\n").every((l) => l.trim() === "" || l.trim().startsWith("--"));
  return script.split(/^[ \t]*GO[ \t]*\r?$/im).map((b) => b.trim()).filter((b) => b.length > 0 && !commentOnly(b));
}
