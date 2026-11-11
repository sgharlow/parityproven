/**
 * Result-set comparison for the spec-driven harness.
 *
 * Rules (verification-standard.md step 3):
 *  - row count, column names (exact), values
 *  - ORDER is compared only where the source guarantees one (`orderKey`): both engines must
 *    return rows non-decreasing on the key, and rows sharing a key are compared as multisets
 *    (the source does not define their relative order)
 *  - with no orderKey the whole result is compared as a multiset
 * Returns null when equivalent, otherwise a human-readable description of the first difference.
 */

import type { RowSet } from "../types.js";
import { microsToIso } from "./rows.js";

type DtDate = Date & { nanosecondsDelta?: number };

function canonicalCell(value: unknown, declaredType: string): string {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "boolean") return `b:${value ? 1 : 0}`;
  if (typeof value === "number") return `n:${Object.is(value, -0) ? 0 : value}`;
  if (typeof value === "bigint") return `n:${value}`;
  // the SQL Server driver returns bigint as a string to avoid precision loss; values here stay within 2^53
  if (typeof value === "string" && declaredType === "bigint" && /^-?\d+$/.test(value)) return `n:${Number(value)}`;
  if (value instanceof Date) {
    if (declaredType === "date") return `d:${value.toISOString().slice(0, 10)}`;
    const delta = (value as DtDate).nanosecondsDelta ?? 0;   // seconds below 1 ms (tedious)
    const micros = BigInt(value.getTime()) * 1000n + BigInt(Math.round(delta * 1_000_000));
    return `t:${microsToIso(micros)}`;
  }
  if (typeof value === "string") {
    // well-known text from STAsText() ("POINT (x y)") and ST_AsText() ("POINT(x y)")
    const pt = value.match(/^POINT\s*\(\s*(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s*\)$/i);
    if (pt) return `g:POINT(${Number(pt[1])} ${Number(pt[2])})`;
    if (declaredType === "date") return `d:${value.slice(0, 10)}`;
    if (declaredType === "timestamp") {
      const m = value.replace(" ", "T").match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/);
      if (m) return `t:${m[1]}.${(m[2] ?? "").padEnd(6, "0").slice(0, 6)}`;
    }
    return `s:${value}`;
  }
  return `?:${String(value)}`;
}

function canonicalRows(rs: RowSet): string[][] {
  return rs.rows.map((row) => row.map((v, i) => canonicalCell(v, rs.columns[i]?.declaredType ?? "")));
}

function rawLess(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return (a as number | string) < (b as number | string) ? -1 : 1;
}

function orderViolation(rs: RowSet, keyIdx: number[], label: string): string | null {
  for (let i = 1; i < rs.rows.length; i++) {
    for (const k of keyIdx) {
      const c = rawLess(rs.rows[i - 1][k], rs.rows[i][k]);
      if (c < 0) break;           // strictly increasing on this key column → fine
      if (c > 0) return `${label} rows ${i - 1}/${i} are out of order on "${rs.columns[k].name}"`;
    }
  }
  return null;
}

/** Drop named columns from a result set (used only for the diagnostic re-run of a known limitation). */
function withoutColumns(rs: RowSet, names: string[]): RowSet {
  if (!names.length) return rs;
  const keep = rs.columns.map((c, i) => (names.includes(c.name) ? -1 : i)).filter((i) => i >= 0);
  return { columns: keep.map((i) => rs.columns[i]), rows: rs.rows.map((r) => keep.map((i) => r[i])) };
}

export function compareResults(ssIn: RowSet, pgIn: RowSet, orderKey: string[], excludeColumns: string[] = []): string | null {
  const ss = withoutColumns(ssIn, excludeColumns);
  const pg = withoutColumns(pgIn, excludeColumns);
  // column names, exact
  const ssNames = ss.columns.map((c) => c.name);
  const pgNames = pg.columns.map((c) => c.name);
  if (ssNames.length !== pgNames.length || ssNames.some((n, i) => n !== pgNames[i])) {
    return `column names differ:\n  SQL Server: ${JSON.stringify(ssNames)}\n  PostgreSQL: ${JSON.stringify(pgNames)}`;
  }
  if (ss.rows.length !== pg.rows.length) {
    return `row count differs: SQL Server ${ss.rows.length}, PostgreSQL ${pg.rows.length}`;
  }

  const keyIdx = orderKey.map((k) => ssNames.indexOf(k));
  if (keyIdx.some((i) => i < 0)) return `orderKey column not in output: ${JSON.stringify(orderKey)}`;

  if (keyIdx.length) {
    const v = orderViolation(ss, keyIdx, "SQL Server") ?? orderViolation(pg, keyIdx, "PostgreSQL");
    if (v) return v;
  }

  const a = canonicalRows(ss);
  const b = canonicalRows(pg);
  const keyOf = (row: string[]): string => keyIdx.map((i) => row[i]).join("\u0001");
  const rowKey = (row: string[]): string => row.join("\u0001");

  // group by order key (single group when unordered), preserving group sequence
  const groups = (rows: string[][]): Array<{ key: string; rows: string[] }> => {
    const out: Array<{ key: string; rows: string[] }> = [];
    for (const r of rows) {
      const k = keyIdx.length ? keyOf(r) : "*";
      const last = out[out.length - 1];
      if (keyIdx.length && last && last.key === k) last.rows.push(rowKey(r));
      else if (!keyIdx.length && last) last.rows.push(rowKey(r));
      else out.push({ key: k, rows: [rowKey(r)] });
    }
    return out;
  };
  const ga = groups(a);
  const gb = groups(b);
  if (ga.length !== gb.length) return `group count differs: SQL Server ${ga.length}, PostgreSQL ${gb.length}`;
  for (let i = 0; i < ga.length; i++) {
    if (ga[i].key !== gb[i].key) return `order-key sequence differs at group ${i}: SQL Server ${JSON.stringify(ga[i].key)}, PostgreSQL ${JSON.stringify(gb[i].key)}`;
    const x = [...ga[i].rows].sort();
    const y = [...gb[i].rows].sort();
    for (let j = 0; j < x.length; j++) {
      if (x[j] !== y[j]) {
        const cx = x[j].split("\u0001");
        const cy = y[j].split("\u0001");
        const col = cx.findIndex((v, ci) => v !== cy[ci]);
        return `value differs in group ${i} (key ${JSON.stringify(ga[i].key)}), column "${ssNames[col]}": SQL Server ${cx[col]} vs PostgreSQL ${cy[col]}`;
      }
    }
  }
  return null;
}
