/**
 * Verification step 4: runtime within a factor (default 1.5x) on a synthetic volume.
 *
 * Both engines get the same generated rows (batched inserts). The measure is SERVER-SIDE
 * execution time, not client latency: SET STATISTICS TIME on SQL Server and EXPLAIN ANALYZE on
 * PostgreSQL. (An earlier attempt measured client latency and mostly compared the two Node
 * drivers parsing result rows, so it was discarded.) The object is run twice to warm up and
 * 7 times to measure; the median is used.
 *
 * One extra client run fetches the full results at volume and compares them, which covers
 * the "large row counts" trap for step 3.
 *
 * Caveats recorded with the result: both databases run in Docker on one machine; SQL Server is
 * the Linux build; SQL Server reports whole milliseconds; PostgreSQL's function is a black box
 * to EXPLAIN. The number is evidence, not a benchmark claim.
 */

import * as fc from "fast-check";
import type { MssqlClient } from "../clients/mssql-client.js";
import type { Connections } from "./run.js";
import type { ObjectSpec, Row, TableSpec } from "./spec.js";
import { pgTableName, tableKey } from "./spec.js";
import { baseColArb, materialise, T0, type Dataset } from "./rows.js";
import { compareResults } from "./compare.js";

export const RUNTIME_FACTOR = 1.5;
const WARMUPS = 2;
const TIMED = 7;

export interface BenchResult {
  volume: number;
  timedRuns: number;
  sqlServerMs: number;
  postgresMs: number;
  ratio: number;
  threshold: number;
  passed: boolean;
  resultRows: number;
  /** null when the results at volume matched; otherwise the first difference. */
  volumeMismatch: string | null;
}

/** Small deterministic PRNG so a volume run is reproducible from its seed. */
function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function volumeRows(t: TableSpec, n: number, cutoffs: { last: bigint; new: bigint } | null, seed: number): Row[] {
  const rnd = prng(seed ^ (t.name.length * 2654435761));
  const sampled: Record<string, unknown[]> = {};
  for (const c of t.columns) {
    if (c.role === "pk" || c.role === "ref") continue;
    sampled[c.name] = fc.sample(baseColArb(c, cutoffs, 1), { numRuns: n, seed: seed + c.name.length });
  }
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const row: Row = {};
    for (const c of t.columns) {
      if (c.role === "pk") row[c.name] = i + 1;
      else if (c.role === "ref") row[c.name] = c.nullable && rnd() < 0.2 ? null : 1 + Math.floor(rnd() * n);
      else row[c.name] = c.nullable && rnd() < 0.2 ? null : sampled[c.name][i];
    }
    rows.push(row);
  }
  return rows;
}

const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;

export async function runBenchmark(
  conn: Connections,
  scratch: MssqlClient,
  spec: ObjectSpec,
  opts: { fn: string; seed: number; volume: number; ssSql: string; pgSql: string }
): Promise<BenchResult> {
  const cutoffs = spec.windowParams ? { last: T0, new: T0 + 10_000_000n } : null;
  const dataset: Dataset = { cutoffs, args: [], tables: {} };
  for (const t of spec.tables) dataset.tables[tableKey(t)] = volumeRows(t, opts.volume, cutoffs, opts.seed);
  const data = materialise(spec, dataset);

  for (const t of spec.tables) {
    const rows = data.tables[tableKey(t)];
    const geo = t.columns.filter((c) => c.type.kind === "geography").map((c) => c.name);
    const ssWrap = Object.fromEntries(geo.map((n) => [n, (ph: string) => `geography::STGeomFromText(${ph}, 4326)`]));
    const pgWrap = Object.fromEntries(geo.map((n) => [n, (ph: string) => `ST_GeogFromText(${ph})`]));
    await scratch.loadRowsBulk(`[${t.schema}].[${t.name}]`, rows, ssWrap);
    await conn.pg.loadRowsBulk(pgTableName(t), rows, pgWrap);
    await scratch.query(`UPDATE STATISTICS [${t.schema}].[${t.name}]`, []);
  }
  await conn.pg.query("ANALYZE", []);

  // statements to time: set-based override for scalar functions, otherwise the normal call
  const isScalar = (spec.params?.length ?? 0) > 0;
  const params = data.cutoffs ? [data.cutoffs.last, data.cutoffs.new] : [];
  const ssTimed = isScalar ? (spec.benchSs ?? "") : opts.ssSql;
  const ssParams = isScalar ? [] : params;
  let pgTimed = isScalar ? (spec.benchPg ?? "").replace("{fn}", opts.fn) : opts.pgSql;
  if (!isScalar && params.length) pgTimed = pgTimed.replace("$1", lit(params[0])).replace("$2", lit(params[1]));
  if (!ssTimed || !pgTimed) throw new Error(`${spec.name}: scalar function needs benchSs/benchPg in its spec`);

  for (let i = 0; i < WARMUPS; i++) {
    await scratch.serverElapsedMs(ssTimed, ssParams);
    await conn.pg.explainMs(pgTimed);
  }
  const ss: number[] = [];
  const pg: number[] = [];
  for (let i = 0; i < TIMED; i++) {
    ss.push(await scratch.serverElapsedMs(ssTimed, ssParams));
    pg.push(await conn.pg.explainMs(pgTimed));
  }

  // one client run to compare the full results at volume (not timed)
  let volumeMismatch: string | null = null;
  let resultRows = 0;
  if (!isScalar) {
    const a = await scratch.query(opts.ssSql, params);
    const b = await conn.pg.query(opts.pgSql, params);
    resultRows = a.rows.length;
    volumeMismatch = compareResults(a, b, spec.orderKey);
  } else {
    const a = await scratch.query(ssTimed, []);
    const b = await conn.pg.query(pgTimed, []);
    resultRows = 100;   // calls made (see benchSs); the compared result is one aggregate row
    volumeMismatch = compareResults(a, b, []);
  }

  const sqlServerMs = Math.max(median(ss), 1);   // SQL Server reports whole ms; 0 would make the ratio meaningless
  const postgresMs = median(pg);
  const ratio = postgresMs / sqlServerMs;
  return {
    volume: opts.volume,
    timedRuns: TIMED,
    sqlServerMs: Math.round(sqlServerMs * 100) / 100,
    postgresMs: Math.round(postgresMs * 100) / 100,
    ratio: Math.round(ratio * 100) / 100,
    threshold: RUNTIME_FACTOR,
    passed: ratio <= RUNTIME_FACTOR,   // a result mismatch at volume is a step-3 finding, reported separately
    resultRows,
    volumeMismatch,
  };
}

export async function clearAll(conn: Connections, scratch: MssqlClient, spec: ObjectSpec): Promise<void> {
  for (const t of spec.tables) {
    await scratch.query(`DELETE FROM [${t.schema}].[${t.name}]`, []);
    await conn.pg.query(`DELETE FROM ${pgTableName(t)}`, []);
  }
}
