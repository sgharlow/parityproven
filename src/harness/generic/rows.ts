/**
 * Data generation for the spec-driven harness (fast-check).
 *
 * Biases (verification-standard.md traps):
 *  - datetime2 values land on / next to the cutoffs, including +/-1 and sub-microsecond ticks
 *  - NULL in every nullable column (~20%)
 *  - decimals include rounding-edge values (…5 at the digit after the scale)
 *  - nvarchar includes '', ' ', trailing spaces
 *  - ref columns draw from 1..4 so joins hit often
 * Datetime values are generated at 100 ns resolution and normalised to µs on materialise;
 * the number of values changed by normalisation is reported as a finding.
 */

import * as fc from "fast-check";
import type { ColSpec, ObjectSpec, Row, TableSpec } from "./spec.js";
import { tableKey } from "./spec.js";

export const T0 = BigInt(Date.UTC(2020, 0, 1)) * 10000n;   // 100 ns ticks since Unix epoch

export interface Cutoffs { last: bigint; new: bigint }
export interface Dataset { cutoffs: Cutoffs | null; tables: Record<string, Row[]> }
export interface Materialised {
  cutoffs: { last: string; new: string } | null;
  tables: Record<string, Row[]>;
  subMicrosecondNormalised: number;
}

const EDGE = [-11n, -10n, -9n, -1n, 0n, 1n, 9n, 10n, 11n, 99n, 100n, 101n, 999n, 1000n, 1001n, 9_999_999n, 10_000_000n, 10_000_001n];

export const cutoffsArb: fc.Arbitrary<Cutoffs> = fc
  .tuple(
    fc.oneof(fc.constantFrom(...EDGE), fc.bigInt({ min: -20_000_000n, max: 20_000_000n })),
    fc.oneof(fc.constantFrom(1n, 2n, 9n, 10n, 11n, 100n, 1000n, 10_000_000n), fc.bigInt({ min: 1n, max: 20_000_000n }))
  )
  .map(([o, g]) => ({ last: T0 + o, new: T0 + o + g }));

function datetimeArb(c: Cutoffs | null): fc.Arbitrary<bigint> {
  const anywhere = fc.bigInt({ min: T0 - 20_000_000n, max: T0 + 40_000_000n });
  if (!c) return anywhere;
  const near = fc.constantFrom(
    c.last - 1n, c.last, c.last + 1n, c.last + 9n, c.last + 10n, c.last + 11n,
    c.new - 1n, c.new, c.new + 1n, c.new + 9n, c.new + 10n, c.new + 11n
  );
  const inside = fc.bigInt({ min: c.last, max: c.new });
  return fc.oneof(
    { arbitrary: near, weight: 4 },
    { arbitrary: inside, weight: 4 },
    { arbitrary: anywhere, weight: 1 }
  );
}

function decimalArb(p: number, s: number): fc.Arbitrary<string> {
  const scale = 10 ** s;
  const hints = [0, 1, 5, 15, 25, 50, 99, 105, 505, 995, 999, 1005, 1500, 1995, 2500, 3500, 15000, 100000];
  const unscaled = fc.oneof(
    { arbitrary: fc.constantFrom(...hints, ...hints.map((n) => -n)), weight: 3 },
    { arbitrary: fc.integer({ min: -1_000_000, max: 1_000_000 }), weight: 2 }
  );
  const maxUnscaled = 10 ** Math.min(p, 15) - 1;
  return unscaled.map((n) => {
    const clamped = Math.max(-maxUnscaled, Math.min(maxUnscaled, n));
    return (clamped / scale).toFixed(s);
  });
}

function baseColArb(col: ColSpec, c: Cutoffs | null, k: number): fc.Arbitrary<unknown> {
  const t = col.type;
  switch (t.kind) {
    case "int":
      // ref columns draw from the dataset's key universe 1..k; an occasional dangling key (k+1) keeps joins honest
      return col.role === "ref"
        ? fc.oneof({ arbitrary: fc.integer({ min: 1, max: k }), weight: 12 }, { arbitrary: fc.constant(k + 1), weight: 1 })
        : fc.oneof(fc.constantFrom(0, 1, -1, 2, 3, 10), fc.integer({ min: -50, max: 500 }));
    case "decimal":
      return decimalArb(t.p, t.s);
    case "nvarchar":
      return fc.oneof(
        fc.constantFrom("", " ", "a", "A", "a ", " a", "Café", "x'y"),
        fc.string({ maxLength: Math.min(t.n, 8) })
      );
    case "date":
      return fc.integer({ min: 0, max: 3 }).map((d) => new Date(Date.UTC(2020, 0, 1 + d)).toISOString().slice(0, 10));
    case "datetime2":
      return datetimeArb(c);
    case "bit":
      return fc.boolean();
  }
}

function tableArb(t: TableSpec, c: Cutoffs | null, k: number): fc.Arbitrary<Row[]> {
  const shape: Record<string, fc.Arbitrary<unknown>> = {};
  for (const col of t.columns) {
    if (col.role === "pk") continue;
    const base = baseColArb(col, c, k);
    shape[col.name] = col.nullable ? fc.option(base, { nil: null, freq: 4 }) : base;
  }
  const pks = t.columns.filter((x) => x.role === "pk").map((x) => x.name);
  // About k rows so every key in 1..k usually has a partner; empty (~5%) and larger tables still occur.
  const rec = fc.record(shape);
  const rowsArb = fc.oneof(
    { arbitrary: fc.array(rec, { minLength: k, maxLength: k }), weight: 12 },
    { arbitrary: fc.array(rec, { minLength: k, maxLength: k + 2 }), weight: 6 },
    { arbitrary: fc.constant([] as Array<Record<string, unknown>>), weight: 1 }
  );
  return rowsArb.map((rows) =>
    rows.map((r, i) => {
      const row: Row = {};
      for (const pk of pks) row[pk] = i + 1;
      return { ...row, ...r };
    })
  );
}

export function datasetArb(spec: ObjectSpec): fc.Arbitrary<Dataset> {
  const keyUniverse = fc.oneof(
    { arbitrary: fc.constant(1), weight: 3 },       // every ref is 1: joins always line up
    { arbitrary: fc.integer({ min: 2, max: 3 }), weight: 2 }
  );
  return fc.tuple(cutoffsArb, keyUniverse).chain(([c, k]) => {
    const eff = spec.windowParams ? c : null;
    const shape: Record<string, fc.Arbitrary<Row[]>> = {};
    for (const t of spec.tables) shape[tableKey(t)] = tableArb(t, eff, k);
    return fc.record(shape).map((tables) => ({ cutoffs: eff, tables }));
  });
}

/** Format µs-since-epoch as 'YYYY-MM-DDTHH:MM:SS.ffffff'. */
export function microsToIso(micros: bigint): string {
  const ms = Number(micros / 1000n);
  const frac = Number(((micros % 1_000_000n) + 1_000_000n) % 1_000_000n);
  return `${new Date(ms).toISOString().slice(0, 19)}.${String(frac).padStart(6, "0")}`;
}

/** Normalise 100 ns ticks to µs. Returns the ISO string and whether precision was lost. */
export function normaliseTicks(ticks: bigint): { iso: string; lost: boolean } {
  const micros = ticks / 10n;
  return { iso: microsToIso(micros), lost: ticks % 10n !== 0n };
}

export function materialise(spec: ObjectSpec, d: Dataset): Materialised {
  let lost = 0;
  const conv = (v: bigint): string => {
    const n = normaliseTicks(v);
    if (n.lost) lost++;
    return n.iso;
  };
  const tables: Record<string, Row[]> = {};
  for (const t of spec.tables) {
    const dtCols = t.columns.filter((c) => c.type.kind === "datetime2").map((c) => c.name);
    tables[tableKey(t)] = (d.tables[tableKey(t)] ?? []).map((row) => {
      const out: Row = { ...row };
      for (const name of dtCols) if (typeof out[name] === "bigint") out[name] = conv(out[name] as bigint);
      return out;
    });
  }
  const cutoffs = d.cutoffs ? { last: conv(d.cutoffs.last), new: conv(d.cutoffs.new) } : null;
  return { cutoffs, tables, subMicrosecondNormalised: lost };
}
