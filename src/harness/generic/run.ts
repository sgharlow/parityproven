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
import type { RowSet } from "../types.js";
import type { ObjectSpec, TableSpec } from "./spec.js";
import { postgresDdl, pgTableName, sqlServerDdl, tableKey } from "./spec.js";
import { datasetArb, materialise, type Materialised } from "./rows.js";
import { compareResults } from "./compare.js";

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

export async function fetchSourceDefinition(source: MssqlClient, spec: ObjectSpec): Promise<string> {
  const rs = await source.query(
    `SELECT m.definition FROM sys.sql_modules m WHERE m.object_id = OBJECT_ID('${spec.schema}.${spec.name}')`,
    []
  );
  const def = rs.rows[0]?.[0];
  if (typeof def !== "string") throw new Error(`No T-SQL definition found for ${spec.schema}.${spec.name}`);
  return def;
}

/** Fresh scratch database with spec tables and the original, unmodified T-SQL object. */
export async function prepareSqlServer(conn: Connections, spec: ObjectSpec, definition: string): Promise<MssqlClient> {
  await conn.mssqlMaster.query(
    `IF DB_ID('${SCRATCH_DB}') IS NOT NULL BEGIN ALTER DATABASE ${SCRATCH_DB} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ${SCRATCH_DB}; END`,
    []
  );
  await conn.mssqlMaster.query(`CREATE DATABASE ${SCRATCH_DB}`, []);
  const scratch = new MssqlClient({ server: "localhost", port: 1433, user: "sa", password: conn.saPassword, database: SCRATCH_DB });
  const schemas = new Set<string>([spec.schema, ...spec.tables.map((t) => t.schema)]);
  schemas.delete("dbo");   // exists in every new database
  for (const s of schemas) await scratch.query(`CREATE SCHEMA [${s}]`, []);
  for (const t of spec.tables) {
    await scratch.query(sqlServerDdl(t), []);
    // Modelling assumption, applied to both engines: every foreign-key column is indexed (as real schemas usually do).
    for (const c of t.columns.filter((x) => x.role === "ref")) {
      await scratch.query(`CREATE INDEX [ix_${t.name}_${c.name}] ON [${t.schema}].[${t.name}] ([${c.name}])`, []);
    }
  }
  await scratch.query(definition, []);
  return scratch;
}

export async function preparePostgres(conn: Connections, spec: ObjectSpec): Promise<void> {
  // init scripts only run on a fresh data directory; make the extension a harness precondition instead
  await conn.pg.query("CREATE EXTENSION IF NOT EXISTS postgis", []);
  const schemas = new Set<string>(spec.tables.map((t) => t.schema.toLowerCase()));
  for (const s of schemas) await conn.pg.query(`CREATE SCHEMA IF NOT EXISTS ${s}`, []);
  for (const t of spec.tables) {
    await conn.pg.query(`DROP TABLE IF EXISTS ${pgTableName(t)} CASCADE`, []);
    await conn.pg.query(postgresDdl(t), []);
    for (const c of t.columns.filter((x) => x.role === "ref")) {
      await conn.pg.query(`CREATE INDEX "ix_${t.name}_${c.name}" ON ${pgTableName(t)} ("${c.name}")`, []);
    }
  }
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
       LOOP EXECUTE 'DROP FUNCTION ' || r.sig; END LOOP; END $do$`,
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

/** A sample is informative when the object returned at least one non-NULL value. */
const informative = (rs: RowSet): boolean => rs.rows.some((r) => r.some((v) => v !== null && v !== undefined));

async function clearTables(scratch: MssqlClient, pg: PgClient, tables: TableSpec[]): Promise<void> {
  for (const t of tables) {
    await scratch.query(`DELETE FROM [${t.schema}].[${t.name}]`, []);
    await pg.query(`DELETE FROM ${pgTableName(t)}`, []);
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
    for (const t of spec.tables) {
      const rows = data.tables[tableKey(t)] ?? [];
      // spatial values are built from WKT by each engine's own constructor
      const geo = t.columns.filter((c) => c.type.kind === "geography").map((c) => c.name);
      const ssWrap = Object.fromEntries(geo.map((n) => [n, (ph: string) => `geography::STGeomFromText(${ph}, 4326)`]));
      const pgWrap = Object.fromEntries(geo.map((n) => [n, (ph: string) => `ST_GeogFromText(${ph})`]));
      await scratch.loadRows(`[${t.schema}].[${t.name}]`, rows, ssWrap);
      await conn.pg.loadRows(pgTableName(t), rows, pgWrap);
    }
    const params = data.args && data.args.length ? data.args : data.cutoffs ? [data.cutoffs.last, data.cutoffs.new] : [];
    const ss = await scratch.query(ssCall(spec), params);
    const pg = await conn.pg.query(pgCall(spec, fn), params);
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
      if (informative(ss)) outcome.samplesWithRows++;
    }
    if (!outcome.outputColumns) {
      outcome.outputColumns = ss.columns.map((c, i) => ({ sqlServer: c.declaredType, postgres: pg.columns[i]?.declaredType ?? "?" }));
    }
    const diff = compareResults(ss, pg, spec.orderKey, opts.excludeColumns ?? []);
    if (diff) throw new Error(`${label}: ${diff}\n  input: ${JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  };

  // 1. hand-derived trap cases always run first
  for (const fc_ of spec.fixedCases ?? []) {
    try {
      await check(
        { cutoffs: fc_.cutoffs ?? null, args: fc_.args, tables: fc_.tables, subMicrosecondNormalised: 0 },
        `fixed case "${fc_.label}"`,
        false
      );
    } catch (e) {
      return { ...outcome, passed: false, failure: (e as Error).message };
    }
  }

  // 2. random property
  const prop = fc.asyncProperty(datasetArb(spec), async (d) => {
    await check(materialise(spec, d), "random sample", true);
  });
  // Shrinking replays the database round trips many times to minimise a counterexample. Worth it for a
  // real failure; not for a planted defect, where detection is all that matters (it also made runs crawl).
  const result = await fc.check(prop, { seed: opts.seed, numRuns: opts.numRuns, endOnFailure: opts.shrink === false });
  if (result.failed) {
    const err = result.errorInstance instanceof Error ? result.errorInstance.message : String(result.error);
    return { ...outcome, passed: false, failure: `${err}\n  (shrunk in ${result.numShrinks} step(s))` };
  }
  // A property that almost never returns rows proves nothing. Require real coverage.
  if (outcome.samples > 0 && outcome.samplesWithRows / outcome.samples < MIN_NON_EMPTY_FRACTION) {
    return {
      ...outcome, passed: false,
      failure: `vacuous: only ${outcome.samplesWithRows}/${outcome.samples} samples returned any rows (need >= ${MIN_NON_EMPTY_FRACTION * 100}%)`,
    };
  }
  return outcome;
}
