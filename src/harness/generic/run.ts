/**
 * Spec-driven equivalence run.
 *
 * Isolation: the SQL Server object is deployed UNCHANGED (definition read from the restored
 * sample database) into a scratch database whose tables are created from the spec, with no
 * foreign keys and no pre-existing rows. PostgreSQL gets the matching tables and the converted
 * function. Each engine is exercised only through its own client.
 */

import * as fc from "fast-check";
import { readFileSync } from "fs";
import { MssqlClient } from "../clients/mssql-client.js";
import { PgClient } from "../clients/pg-client.js";
import { mssqlEndpoint } from "../endpoints.js";
import type { RowSet } from "../types.js";
import type { ObjectSpec, Row, TableSpec } from "./spec.js";
import { postgresDdl, pgTableName, sqlServerDdl, tableKey } from "./spec.js";
import { datasetArb, materialise, type Materialised } from "./rows.js";
import { canonicalTable, compareResults } from "./compare.js";

export const SCRATCH_DB = "pp_scratch";
export const MIN_NON_EMPTY_FRACTION = 0.3;

export interface Connections {
  mssqlMaster: MssqlClient;
  pg: PgClient;
  saPassword: string;
}

export interface RunOutcome {
  passed: boolean;
  seed: number;
  numRuns: number;
  failure?: string;
  subMicrosecondNormalised: number;
  rowsCompared: number;
  /** Random samples executed, and how many of them returned at least one row. */
  samples: number;
  samplesWithRows: number;
  outputColumns?: Array<{ sqlServer: string; postgres: string }>;
}

export async function fetchSourceDefinition(source: MssqlClient, spec: { schema: string; name: string }): Promise<string> {
  const rs = await source.query(
    `SELECT m.definition FROM sys.sql_modules m WHERE m.object_id = OBJECT_ID('${spec.schema}.${spec.name}')`,
    []
  );
  const def = rs.rows[0]?.[0];
  if (typeof def !== "string") throw new Error(`No T-SQL definition found for ${spec.schema}.${spec.name}`);
  return def;
}

/** The collation of the database the object lives in. Text comparison, LIKE and ORDER BY depend on it. */
export async function fetchSourceCollation(source: MssqlClient): Promise<string> {
  const rs = await source.query(`SELECT CONVERT(sysname, DATABASEPROPERTYEX(DB_NAME(), 'Collation'))`, []);
  const c = rs.rows[0]?.[0];
  if (typeof c !== "string" || !/^[A-Za-z0-9_]+$/.test(c)) throw new Error(`Unexpected source collation: ${String(c)}`);
  return c;
}

/** The source database's compatibility level. Several T-SQL behaviours (JSON functions among them) depend on it. */
export async function fetchSourceCompatibilityLevel(source: MssqlClient): Promise<number> {
  const rs = await source.query(`SELECT compatibility_level FROM sys.databases WHERE name = DB_NAME()`, []);
  const n = Number(rs.rows[0]?.[0]);
  if (!Number.isInteger(n) || n < 80 || n > 200) throw new Error(`Unexpected compatibility level: ${String(rs.rows[0]?.[0])}`);
  return n;
}

/**
 * Fresh scratch database with spec tables and the original, unmodified T-SQL object.
 * The scratch database takes the source database's collation, so string behaviour is the source's.
 */
export async function prepareSqlServer(
  conn: Connections, spec: ObjectSpec, definition: string, collation?: string, compatibilityLevel?: number,
  dependencyDefinitions: string[] = []
): Promise<MssqlClient> {
  await conn.mssqlMaster.query(
    `IF DB_ID('${SCRATCH_DB}') IS NOT NULL BEGIN ALTER DATABASE ${SCRATCH_DB} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ${SCRATCH_DB}; END`,
    []
  );
  await conn.mssqlMaster.query(`CREATE DATABASE ${SCRATCH_DB}${collation ? ` COLLATE ${collation}` : ""}`, []);
  if (compatibilityLevel) await conn.mssqlMaster.query(`ALTER DATABASE ${SCRATCH_DB} SET COMPATIBILITY_LEVEL = ${compatibilityLevel}`, []);
  if (spec.memoryOptimizedFilegroup) {
    await conn.mssqlMaster.query(`ALTER DATABASE ${SCRATCH_DB} ADD FILEGROUP ${SCRATCH_DB}_mod CONTAINS MEMORY_OPTIMIZED_DATA`, []);
    await conn.mssqlMaster.query(
      `ALTER DATABASE ${SCRATCH_DB} ADD FILE (NAME = '${SCRATCH_DB}_mod', FILENAME = '/var/opt/mssql/data/${SCRATCH_DB}_mod') TO FILEGROUP ${SCRATCH_DB}_mod`, []
    );
  }
  const scratch = new MssqlClient({ ...mssqlEndpoint(), user: "sa", password: conn.saPassword, database: SCRATCH_DB });
  const schemas = new Set<string>([spec.schema, ...spec.tables.map((t) => t.schema)]);
  schemas.delete("dbo");   // exists in every new database
  for (const s of schemas) await scratch.query(`CREATE SCHEMA [${s}]`, []);
  for (const t of spec.tables) {
    await scratch.query(sqlServerDdl(t), []);
    if (t.tvp || t.memoryOptimized) continue;   // indexes on these are declared inline
    // Modelling assumption, applied to both engines: every foreign-key column is indexed (as real schemas usually do).
    for (const c of t.columns.filter((x) => x.role === "ref")) {
      await scratch.query(`CREATE INDEX [ix_${t.name}_${c.name}] ON [${t.schema}].[${t.name}] ([${c.name}])`, []);
    }
  }
  for (const q of spec.setup?.sqlServer ?? []) await scratch.query(q, []);
  for (const d of dependencyDefinitions) await scratch.query(d, []);
  await scratch.query(definition, []);
  return scratch;
}

export async function preparePostgres(conn: Connections, spec: ObjectSpec): Promise<void> {
  // init scripts only run on a fresh data directory; make the extension a harness precondition instead
  await conn.pg.query("CREATE EXTENSION IF NOT EXISTS postgis", []);
  const schemas = new Set<string>(spec.tables.map((t) => t.schema.toLowerCase()));
  for (const s of schemas) await conn.pg.query(`CREATE SCHEMA IF NOT EXISTS ${s}`, []);
  for (const t of spec.tables.filter((x) => !x.tvp)) {   // a TVP's PostgreSQL type belongs to the conversion
    await conn.pg.query(`DROP TABLE IF EXISTS ${pgTableName(t)} CASCADE`, []);
    await conn.pg.query(postgresDdl(t), []);
    for (const c of t.columns.filter((x) => x.role === "ref")) {
      await conn.pg.query(`CREATE INDEX "ix_${t.name}_${c.name}" ON ${pgTableName(t)} ("${c.name}")`, []);
    }
  }
  for (const q of spec.setup?.postgres ?? []) await conn.pg.query(q, []);
}

/** Drop a converted object (a view, or every overload of a function) so a changed signature can be redeployed. */
export async function dropPgObject(conn: Connections, spec: ObjectSpec, qualified: string): Promise<void> {
  const [schema, name] = qualified.split(".");
  if (spec.objectClass === "view") {
    await conn.pg.query(`DROP VIEW IF EXISTS ${qualified} CASCADE`, []);
    return;
  }
  await conn.pg.query(
    `DO $do$ DECLARE r record; BEGIN
       FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = '${schema}' AND p.proname = '${name}'
       LOOP EXECUTE 'DROP ROUTINE ' || r.sig; END LOOP; END $do$`,
    []
  );
}

/** Deploy a PostgreSQL object. `qualified` names what is being deployed (the real object or its mutant), so the right one is dropped first. */
export async function deployPgFunction(conn: Connections, spec: ObjectSpec, sqlText: string, qualified: string = spec.pgFunction): Promise<void> {
  const [schema] = qualified.split(".");
  await conn.pg.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`, []);
  await dropPgObject(conn, spec, qualified);
  await conn.pg.query(sqlText, []);
}

export function readSql(path: string): string {
  return readFileSync(path, "utf-8");
}

export const ssCall = (spec: ObjectSpec): string => {
  if (spec.ssCall) return spec.ssCall;
  if (spec.objectClass === "view") return `SELECT * FROM ${spec.schema}.${spec.name}`;
  return spec.windowParams
    ? `EXEC ${spec.schema}.${spec.name} @LastCutoff = ?, @NewCutoff = ?`
    : `EXEC ${spec.schema}.${spec.name}`;
};

export const pgCall = (spec: ObjectSpec, fn: string): string => {
  if (spec.pgCall) return spec.pgCall.replace("{fn}", fn);
  if (spec.objectClass === "view") return `SELECT * FROM ${fn}`;
  return spec.windowParams ? `SELECT * FROM ${fn}($1::timestamp, $2::timestamp)` : `SELECT * FROM ${fn}()`;
};

/** Run a statement on the SQL Server scratch database; FOR JSON chunks are joined into one "result" value. */
export async function queryScratch(scratch: MssqlClient, spec: ObjectSpec, sqlText: string, params: unknown[]): Promise<RowSet> {
  const rs = await scratch.query(sqlText, params);
  if (!spec.forJsonChunks) return rs;
  if (rs.columns.length !== 1 || !rs.columns[0].name.startsWith("JSON_F52E2B61")) {
    throw new Error(`expected a FOR JSON result (single JSON_F52E2B61-... column), got: ${rs.columns.map((c) => c.name).join(", ")}`);
  }
  const text = rs.rows.map((r) => String(r[0] ?? "")).join("");
  return { columns: [{ name: "result", declaredType: rs.columns[0].declaredType }], rows: [[text]] };
}

/** A sample is informative when the object returned at least one non-NULL value. */
const informative = (rs: RowSet): boolean => rs.rows.some((r) => r.some((v) => v !== null && v !== undefined));

async function clearTables(scratch: MssqlClient, pg: PgClient, tables: TableSpec[]): Promise<void> {
  for (const t of tables.filter((x) => !x.tvp)) {
    await scratch.query(`DELETE FROM [${t.schema}].[${t.name}]`, []);
    await pg.query(`DELETE FROM ${pgTableName(t)}`, []);
  }
}

/**
 * Table-valued parameters.
 * SQL Server: the call is preceded by T-SQL that fills a table variable of the parameter's type, one INSERT per row in
 * generated order (so an IDENTITY column numbers the rows 1..n, as for any T-SQL caller); the call then passes the variable.
 * (The TDS driver cannot send a table-valued parameter whose type has an identity column.) Values travel as ordinary
 * parameters and convert on insert, like table loading.
 * PostgreSQL: the same rows as one JSON array (text) at the same argument position; the conversion's pgCall turns it into
 * its own parameter type. Identity columns carry the 1..n numbering SQL Server assigns.
 * Returns the SQL Server statement to run (with ? placeholders) and both engines' arguments.
 */
export function withTableValuedArgs(
  spec: ObjectSpec, data: { tables: Record<string, Row[]> }, base: unknown[]
): { ssSql: string; ssParams: unknown[]; pgParams: unknown[] } {
  const tvps = spec.tables.filter((t) => t.tvp).sort((a, b) => a.tvp!.argIndex - b.tvp!.argIndex);
  const call = ssCall(spec);
  if (!tvps.length) return { ssSql: call, ssParams: base, pgParams: base };

  const prefix: string[] = [];
  const prefixParams: unknown[] = [];
  const pgParams = [...base];
  const byIndex = new Map<number, string>();
  for (const t of tvps) {
    const variable = `@tvp${t.tvp!.argIndex}`;
    byIndex.set(t.tvp!.argIndex, variable);
    prefix.push(`DECLARE ${variable} [${t.schema}].[${t.name}];`);
    const cols = t.columns.filter((c) => !c.identity);
    const rows = data.tables[tableKey(t)] ?? [];
    for (const r of rows) {
      prefix.push(`INSERT INTO ${variable} (${cols.map((c) => `[${c.name}]`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")});`);
      prefixParams.push(...cols.map((c) => r[c.name] ?? null));
    }
    const json = rows.map((r, i) => Object.fromEntries(t.columns.map((c) => [c.name, c.identity ? i + 1 : (r[c.name] ?? null)])));
    pgParams.splice(t.tvp!.argIndex, 0, JSON.stringify(json));
  }
  // the call's placeholders, in order: TVP positions become the table variables, the rest stay ? for the base arguments
  const parts = call.split("?");
  const holes = parts.length - 1;
  if (holes !== base.length + tvps.length) throw new Error(`${spec.name}: ssCall has ${holes} placeholders, expected ${base.length + tvps.length}`);
  let text = parts[0];
  for (let k = 0; k < holes; k++) text += (byIndex.get(k) ?? "?") + parts[k + 1];
  return { ssSql: `${prefix.join("\n")}\n${text}`, ssParams: [...prefixParams, ...base], pgParams };
}

/**
 * State form of step 3: call the object on each engine, record the outcome ("completed" or "raised"), then read every
 * table in stateCheck.tables (ordered by primary key). The result is one row: outcome, then one canonical value per table.
 * Only the object's own declared errors count as an outcome; any other error propagates and fails the run.
 */
async function runForState(
  conn: Connections, scratch: MssqlClient, spec: ObjectSpec, fn: string, ssSql: string, ssParams: unknown[], pgParams: unknown[]
): Promise<{ ss: RowSet; pg: RowSet }> {
  const sc = spec.stateCheck!;
  let ssOutcome = "completed";
  try {
    await scratch.query(ssSql, ssParams);
  } catch (e) {
    const num = (e as { number?: number }).number ?? (e as { originalError?: { info?: { number?: number } } }).originalError?.info?.number;
    const cls = sc.errorClasses?.find((c) => num !== undefined && c.sqlServer.includes(num));
    if (cls) ssOutcome = `raised: ${cls.label}`;
    else if (num !== undefined && sc.sqlServerErrors.includes(num)) ssOutcome = "raised";
    else throw e;
  }
  let pgOutcome = "completed";
  try {
    await conn.pg.query(pgCall(spec, fn), pgParams);
  } catch (e) {
    const code = (e as { code?: string }).code;
    const cls = sc.errorClasses?.find((c) => code !== undefined && c.postgres.includes(code));
    if (cls) pgOutcome = `raised: ${cls.label}`;
    else if (code !== undefined && sc.postgresErrors.includes(code)) pgOutcome = "raised";
    else throw e;
  }
  const columns = [{ name: "outcome", declaredType: "text" }];
  const ssRow: unknown[] = [ssOutcome];
  const pgRow: unknown[] = [pgOutcome];
  for (const key of sc.tables) {
    const t = spec.tables.find((x) => tableKey(x) === key);
    if (!t) throw new Error(`stateCheck table ${key} is not in the spec`);
    const pk = t.columns.filter((c) => c.role === "pk").map((c) => c.name);
    const cols = t.columns.map((c) => c.name);
    // with a key, rows are read in key order; without one they are compared as a multiset (text order is collation-dependent)
    const orderSs = pk.length ? ` ORDER BY ${pk.map((c) => `[${c}]`).join(", ")}` : "";
    const orderPg = pk.length ? ` ORDER BY ${pk.map((c) => `"${c}"`).join(", ")}` : "";
    const ssState = await scratch.query(`SELECT ${cols.map((c) => `[${c}]`).join(", ")} FROM [${t.schema}].[${t.name}]${orderSs}`, []);
    const pgState = await conn.pg.query(`SELECT ${cols.map((c) => `"${c}"`).join(", ")} FROM ${pgTableName(t)}${orderPg}`, []);
    columns.push({ name: key, declaredType: "text" });
    ssRow.push(canonicalTable(ssState, !pk.length));
    pgRow.push(canonicalTable(pgState, !pk.length));
  }
  for (const q of sc.queries ?? []) {
    // observation queries are compared as multisets; a query that needs order states it in its own columns
    columns.push({ name: q.label, declaredType: "text" });
    ssRow.push(canonicalTable(await scratch.query(q.sqlServer, []), true));
    pgRow.push(canonicalTable(await conn.pg.query(q.postgres, []), true));
  }
  return { ss: { columns, rows: [ssRow] }, pg: { columns, rows: [pgRow] } };
}

/** Column name of the one-row result that stands for a declared error (never counted as coverage). */
export const RAISED_COLUMN = "__raised";

async function raisedAs(spec: ObjectSpec, engine: "sqlServer" | "postgres", run: () => Promise<RowSet>): Promise<RowSet> {
  try {
    return await run();
  } catch (e) {
    const err = e as { number?: number; code?: string; originalError?: { info?: { number?: number } } };
    const key = engine === "sqlServer" ? (err.number ?? err.originalError?.info?.number) : err.code;
    const cls = spec.resultErrorClasses?.find((c) =>
      engine === "sqlServer" ? c.sqlServer.includes(key as number) : c.postgres.includes(key as string)
    );
    if (!cls) throw e;
    return { columns: [{ name: RAISED_COLUMN, declaredType: "text" }], rows: [[cls.label]] };
  }
}

async function loadAndRun(
  conn: Connections,
  scratch: MssqlClient,
  spec: ObjectSpec,
  fn: string,
  data: Materialised
): Promise<{ ss: RowSet; pg: RowSet }> {
  try {
    for (const t of spec.tables.filter((x) => !x.tvp)) {
      const rows = data.tables[tableKey(t)] ?? [];
      // spatial values are built from WKT by each engine's own constructor
      const geo = t.columns.filter((c) => c.type.kind === "geography").map((c) => c.name);
      const bin = t.columns.filter((c) => c.type.kind === "varbinary").map((c) => c.name);
      const ssWrap = Object.fromEntries([
        ...geo.map((n) => [n, (ph: string) => `geography::STGeomFromText(${ph}, 4326)`] as const),
        // binary goes to SQL Server as a hex string (style 2): the driver rejects a zero-length varbinary parameter,
        // and an untyped NULL parameter arrives as nvarchar, which does not convert implicitly to varbinary
        ...bin.map((n) => [n, (ph: string) => `CONVERT(varbinary(max), ${ph}, 2)`] as const),
      ]);
      const pgWrap = Object.fromEntries(geo.map((n) => [n, (ph: string) => `ST_GeogFromText(${ph})`]));
      const asBytes = (v: unknown): Buffer | null => (v instanceof Uint8Array ? Buffer.from(v) : null);
      const ssRows = bin.length ? rows.map((r) => ({ ...r, ...Object.fromEntries(bin.map((n) => [n, asBytes(r[n])?.toString("hex") ?? null])) })) : rows;
      const pgRows = bin.length ? rows.map((r) => ({ ...r, ...Object.fromEntries(bin.map((n) => [n, asBytes(r[n])])) })) : rows;
      await scratch.loadRows(`[${t.schema}].[${t.name}]`, ssRows, ssWrap);
      await conn.pg.loadRows(pgTableName(t), pgRows, pgWrap);
    }
    if (spec.sampleSetup) {
      const s = spec.sampleSetup(data);
      for (const q of s.sqlServer) await scratch.query(q, []);
      for (const q of s.postgres) await conn.pg.query(q, []);
    }
    const base = data.args && data.args.length ? data.args : data.cutoffs ? [data.cutoffs.last, data.cutoffs.new] : [];
    const { ssSql, ssParams, pgParams } = withTableValuedArgs(spec, data, base);
    if (spec.stateCheck) return await runForState(conn, scratch, spec, fn, ssSql, ssParams, pgParams);
    if (spec.resultErrorClasses) {
      // a declared error is an outcome: both engines must raise the same class, or both return the same rows
      const ss = await raisedAs(spec, "sqlServer", () => queryScratch(scratch, spec, ssSql, ssParams));
      const pg = await raisedAs(spec, "postgres", () => conn.pg.query(pgCall(spec, fn), pgParams));
      return { ss, pg };
    }
    const ss = await queryScratch(scratch, spec, ssSql, ssParams);
    const pg = await conn.pg.query(pgCall(spec, fn), pgParams);
    return { ss, pg };
  } finally {
    await clearTables(scratch, conn.pg, spec.tables);
  }
}

export async function runProperty(
  conn: Connections,
  scratch: MssqlClient,
  spec: ObjectSpec,
  opts: { fn: string; seed: number; numRuns: number; excludeColumns?: string[]; shrink?: boolean }
): Promise<RunOutcome> {
  const outcome: RunOutcome = {
    passed: true, seed: opts.seed, numRuns: opts.numRuns, subMicrosecondNormalised: 0, rowsCompared: 0,
    samples: 0, samplesWithRows: 0,
  };

  const check = async (data: Materialised, label: string, random: boolean): Promise<void> => {
    const { ss, pg } = await loadAndRun(conn, scratch, spec, opts.fn, data);
    outcome.subMicrosecondNormalised += data.subMicrosecondNormalised;
    outcome.rowsCompared += ss.rows.length;
    if (random) {
      outcome.samples++;
      // state form: a sample counts when the object actually completed (changed data), not when it raised
      const hit = spec.stateCheck
        ? ss.rows[0]?.[0] === "completed" && (spec.informativeData ? spec.informativeData(data) : true)
        : ss.columns[0]?.name !== RAISED_COLUMN && informative(ss);
      if (hit) outcome.samplesWithRows++;
    }
    if (!outcome.outputColumns) {
      outcome.outputColumns = ss.columns.map((c, i) => ({ sqlServer: c.declaredType, postgres: pg.columns[i]?.declaredType ?? "?" }));
    }
    // a raised outcome is one row without the order-key columns: compare it (and a mismatch against rows) without order
    const raised = ss.columns[0]?.name === RAISED_COLUMN || pg.columns[0]?.name === RAISED_COLUMN;
    const diff = compareResults(ss, pg, raised ? [] : spec.orderKey, opts.excludeColumns ?? [], spec.jsonColumns ?? []);
    if (diff) throw new Error(`${label}: ${diff}\n  input: ${JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  };

  // 1. hand-derived trap cases always run first
  for (const fc_ of spec.fixedCases ?? []) {
    try {
      // fixed cases state their data exactly; prepare() is not applied to them
      await check(
        { cutoffs: fc_.cutoffs ?? null, args: fc_.args, tables: structuredClone(fc_.tables), subMicrosecondNormalised: 0 },
        `fixed case "${fc_.label}"`,
        false
      );
    } catch (e) {
      return { ...outcome, passed: false, failure: (e as Error).message };
    }
  }

  // 2. random property
  const prop = fc.asyncProperty(datasetArb(spec), async (d) => {
    const m = materialise(spec, d);
    spec.prepare?.(m);
    await check(m, "random sample", true);
  });
  // Shrinking replays the database round trips many times to minimise a counterexample. Worth it for a
  // real failure; not for a planted defect, where detection is all that matters (it also made runs crawl).
  const result = await fc.check(prop, { seed: opts.seed, numRuns: opts.numRuns, endOnFailure: opts.shrink === false });
  if (result.failed) {
    const err = result.errorInstance instanceof Error ? result.errorInstance.message : String(result.error);
    return { ...outcome, passed: false, failure: `${err}\n  (shrunk in ${result.numShrinks} step(s))` };
  }
  // A property that almost never returns rows proves nothing. Require real coverage.
  const vacuous = vacuityFailure(outcome.samples, outcome.samplesWithRows);
  if (vacuous) return { ...outcome, passed: false, failure: vacuous };
  return outcome;
}

/** The vacuity guard: null when coverage is enough, else the failure text (which starts with "vacuous"). */
export function vacuityFailure(samples: number, samplesWithRows: number): string | null {
  if (samples > 0 && samplesWithRows / samples < MIN_NON_EMPTY_FRACTION) {
    return `vacuous: only ${samplesWithRows}/${samples} samples returned any rows (need >= ${MIN_NON_EMPTY_FRACTION * 100}%)`;
  }
  return null;
}
