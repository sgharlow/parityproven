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
  mssqlSource: MssqlClient;   // the restored sample database (source of the T-SQL definition)
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
  for (const s of schemas) await scratch.query(`CREATE SCHEMA [${s}]`, []);
  for (const t of spec.tables) await scratch.query(sqlServerDdl(t), []);
  await scratch.query(definition, []);
  return scratch;
}

export async function preparePostgres(conn: Connections, spec: ObjectSpec): Promise<void> {
  const schemas = new Set<string>(spec.tables.map((t) => t.schema.toLowerCase()));
  for (const s of schemas) await conn.pg.query(`CREATE SCHEMA IF NOT EXISTS ${s}`, []);
  for (const t of spec.tables) {
    await conn.pg.query(`DROP TABLE IF EXISTS ${pgTableName(t)} CASCADE`, []);
    await conn.pg.query(postgresDdl(t), []);
  }
}

export async function deployPgFunction(conn: Connections, spec: ObjectSpec, sqlText: string): Promise<void> {
  const [schema] = spec.pgFunction.split(".");
  await conn.pg.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`, []);
  await conn.pg.query(sqlText, []);
}

export function readSql(path: string): string {
  return readFileSync(path, "utf-8");
}

const ssCall = (spec: ObjectSpec): string =>
  spec.windowParams
    ? `EXEC ${spec.schema}.${spec.name} @LastCutoff = ?, @NewCutoff = ?`
    : `EXEC ${spec.schema}.${spec.name}`;

const pgCall = (spec: ObjectSpec, fn: string): string =>
  spec.windowParams ? `SELECT * FROM ${fn}($1::timestamp, $2::timestamp)` : `SELECT * FROM ${fn}()`;

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
      await scratch.loadRows(`[${t.schema}].[${t.name}]`, rows);
      await conn.pg.loadRows(pgTableName(t), rows);
    }
    const params = data.cutoffs ? [data.cutoffs.last, data.cutoffs.new] : [];
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
  opts: { fn: string; seed: number; numRuns: number }
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
      if (ss.rows.length > 0) outcome.samplesWithRows++;
    }
    if (!outcome.outputColumns) {
      outcome.outputColumns = ss.columns.map((c, i) => ({ sqlServer: c.declaredType, postgres: pg.columns[i]?.declaredType ?? "?" }));
    }
    const diff = compareResults(ss, pg, spec.orderKey);
    if (diff) throw new Error(`${label}: ${diff}\n  input: ${JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  };

  // 1. hand-derived trap cases always run first
  for (const fc_ of spec.fixedCases ?? []) {
    try {
      await check(
        { cutoffs: fc_.cutoffs ?? null, tables: fc_.tables, subMicrosecondNormalised: 0 },
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
  const result = await fc.check(prop, { seed: opts.seed, numRuns: opts.numRuns });
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
