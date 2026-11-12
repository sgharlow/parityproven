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
export interface Dataset { cutoffs: Cutoffs | null; args: unknown[]; tables: Record<string, Row[]> }
export interface Materialised {
  cutoffs: { last: string; new: string } | null;
  args?: unknown[];
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
  // Business decimals (prices, discounts, quantities) are mostly non-negative: bias 3:1 so
  // arithmetic between them is meaningful, while negatives are still generated.
  const nonNegative = fc.oneof(
    { arbitrary: fc.constantFrom(...hints), weight: 3 },
    { arbitrary: fc.integer({ min: 0, max: 1_000_000 }), weight: 2 }
  );
  const negative = fc.oneof(
    { arbitrary: fc.constantFrom(...hints.filter((n) => n > 0).map((n) => -n)), weight: 3 },
    { arbitrary: fc.integer({ min: -1_000_000, max: -1 }), weight: 2 }
  );
  const unscaled = fc.oneof({ arbitrary: nonNegative, weight: 3 }, { arbitrary: negative, weight: 1 });
  const maxUnscaled = 10 ** Math.min(p, 15) - 1;
  return unscaled.map((n) => {
    const clamped = Math.max(-maxUnscaled, Math.min(maxUnscaled, n));
    return (clamped / scale).toFixed(s);
  });
}

export function baseColArb(col: ColSpec, c: Cutoffs | null, k: number): fc.Arbitrary<unknown> {
  if (col.arbitrary) return col.arbitrary;
  const t = col.type;
  switch (t.kind) {
    case "int":
    case "smallint":
    case "tinyint":
    case "bigint": {
      // ref columns draw from the dataset's key universe 1..k; an occasional dangling key (k+1) keeps joins honest
      if (col.role === "ref") {
        return fc.oneof({ arbitrary: fc.integer({ min: 1, max: k }), weight: 12 }, { arbitrary: fc.constant(k + 1), weight: 1 });
      }
      const natural: [number, number] =
        t.kind === "tinyint" ? [0, 255] : t.kind === "smallint" ? [-32768, 32767] : t.kind === "bigint" ? [-1_000_000_000, 1_000_000_000] : [-50, 500];
      const [lo, hi] = col.range ?? natural;
      const edge = [lo, hi, 0, 1, -1, 2, 3, 6, 7, 10, ...(col.special ?? [])].filter((n) => n >= lo && n <= hi);
      return fc.oneof(
        { arbitrary: fc.constantFrom(...edge), weight: 3 },
        { arbitrary: fc.integer({ min: Math.max(lo, -50), max: Math.min(hi, 500) }), weight: 2 },
        { arbitrary: fc.integer({ min: lo, max: hi }), weight: 1 }
      );
    }
    case "money":
      return decimalArb(19, 4);
    case "datetime": {
      // Columns named *OrderDate drive fiscal-year logic: generate around the 1 July / year-end boundaries.
      if (/orderdate$/i.test(col.name)) {
        return fc.constantFrom(
          "2001-06-30T23:59:59.997", "2001-07-01T00:00:00.000", "2002-01-01T00:00:00.000",
          "2002-06-30T12:00:00.000", "2002-07-01T00:00:00.000", "2003-03-15T00:00:00.000", "2003-07-01T00:00:00.003"
        );
      }
      // Values SQL Server datetime can represent exactly. Two populations:
      //  - columns named Start*/End* (validity periods) sit on either side of the canonical probe instant
      //    2020-01-02 12:00:00 (End* is often NULL = open period), with the probe itself and +/-3 ms as edges
      //  - everything else, including the probe arguments, mostly IS the probe instant, with edges around it
      const probe = "2020-01-02T12:00:00.000";
      const edges = ["2020-01-02T11:59:59.997", "2020-01-02T12:00:00.003", "2020-01-01T00:00:00.000", "2020-01-04T00:00:00.000"];
      if (/^start/i.test(col.name)) {
        return fc.oneof({ arbitrary: fc.constant("2020-01-01T00:00:00.000"), weight: 4 }, { arbitrary: fc.constantFrom(probe, ...edges), weight: 2 });
      }
      if (/^end/i.test(col.name)) {
        return fc.oneof({ arbitrary: fc.constant("2020-01-03T00:00:00.000"), weight: 4 }, { arbitrary: fc.constantFrom(probe, ...edges), weight: 2 });
      }
      return fc.oneof({ arbitrary: fc.constant(probe), weight: 4 }, { arbitrary: fc.constantFrom(...edges), weight: 2 });
    }
    case "char":
      if (col.role === "ref" && t.n >= 2) {
        return fc.oneof({ arbitrary: fc.integer({ min: 1, max: k }).map((n) => `K${n}`), weight: 12 }, { arbitrary: fc.constant(`K${k + 1}`), weight: 1 });
      }
      return fc.oneof(fc.constantFrom("", "a", "A", " a"), fc.string({ maxLength: t.n })).map((s) => s.slice(0, t.n));
    case "decimal":
      return decimalArb(t.p, t.s);
    case "nvarchar":
      if (col.role === "ref" && t.n >= 2) {
        return fc.oneof({ arbitrary: fc.integer({ min: 1, max: k }).map((n) => `K${n}`), weight: 12 }, { arbitrary: fc.constant(`K${k + 1}`), weight: 1 });
      }
      if (col.strings?.length) {
        // a spec vocabulary (names, search terms) dominates, so that text searches actually hit
        return fc.oneof(
          { arbitrary: fc.constantFrom(...col.strings), weight: 6 },
          { arbitrary: fc.constantFrom("", " ", "a", "A", "a ", " a", "Café", "x'y"), weight: 1 },
          { arbitrary: fc.string({ maxLength: Math.min(t.n, 8) }), weight: 1 }
        );
      }
      return fc.oneof(
        fc.constantFrom("", " ", "a", "A", "a ", " a", "Café", "x'y"),
        fc.string({ maxLength: Math.min(t.n, 8) })
      );
    case "date":
      return fc.integer({ min: 0, max: 3 }).map((d) => new Date(Date.UTC(2020, 0, 1 + d)).toISOString().slice(0, 10));
    case "datetime2":
      return datetimeArb(c);
    case "bit":
      if (col.trueFraction !== undefined) {
        const t100 = Math.round(col.trueFraction * 100);
        return fc.integer({ min: 1, max: 100 }).map((n) => n <= t100);
      }
      return fc.boolean();
    case "varbinary":
      return fc.uint8Array({ minLength: 0, maxLength: 32 }).map((a) => Buffer.from(a));
    case "geography":
      // WKT point (longitude latitude), 4 decimals; includes the poles, antimeridian and zero
      return fc
        .tuple(
          fc.oneof(fc.constantFrom(-180, 0, 180), fc.integer({ min: -1_800_000, max: 1_800_000 }).map((n) => n / 10000)),
          fc.oneof(fc.constantFrom(-90, 0, 90), fc.integer({ min: -900_000, max: 900_000 }).map((n) => n / 10000))
        )
        .map(([lon, lat]) => `POINT(${lon} ${lat})`);
  }
}

/** Append the row's number as the last character so no two values in a `distinct` column are equal under any collation. */
export function distinctValue(v: unknown, rowIndex: number, col: ColSpec): unknown {
  if (typeof v !== "string") return v;
  const n = col.type.kind === "nvarchar" || col.type.kind === "char" ? col.type.n : 1000;
  // fixed width, so (value + suffix) is unique per row for fewer than 10,000 rows
  return v.slice(0, n - 4) + String(rowIndex + 1).padStart(4, "0");
}

function tableArb(t: TableSpec, c: Cutoffs | null, k: number): fc.Arbitrary<Row[]> {
  const shape: Record<string, fc.Arbitrary<unknown>> = {};
  for (const col of t.columns) {
    if (col.role === "pk" || col.role === "seq") continue;
    const base = baseColArb(col, c, k);
    // nullable End* columns are open validity periods: NULL is the common case (and what views filter on)
    // fc.option: freq f => NULL about 1/(f+1) (1 => ~50%, 4 => ~20%)
    const nullFreq = col.nullFraction !== undefined
      ? Math.max(1, Math.round(1 / col.nullFraction - 1))
      : /^end/i.test(col.name) ? 1 : 4;
    shape[col.name] = col.nullable ? fc.option(base, { nil: null, freq: nullFreq }) : base;
  }
  const pks = t.columns.filter((x) => x.role === "pk");
  // About k rows so every key in 1..k usually has a partner; empty (~5%) and larger tables still occur.
  const rec = fc.record(shape);
  const rowsArb = t.rows ? fc.array(rec, { minLength: t.rows[0], maxLength: t.rows[1] }) : fc.oneof(
    { arbitrary: fc.array(rec, { minLength: k, maxLength: k }), weight: 12 },
    { arbitrary: fc.array(rec, { minLength: k, maxLength: k + 2 }), weight: 6 },
    { arbitrary: fc.constant([] as Array<Record<string, unknown>>), weight: 1 }
  );
  const seqs = t.columns.filter((x) => x.role === "seq");
  const distinct = t.columns.filter((x) => x.distinct);
  return rowsArb.map((rows) =>
    rows.map((r, i) => {
      const row: Row = {};
      for (const pk of pks) row[pk.name] = pk.type.kind === "nvarchar" || pk.type.kind === "char" ? `K${i + 1}` : i + 1;
      for (const s of seqs) row[s.name] = (s.offset ?? 0) + i + 1;
      const out = { ...row, ...r };
      for (const d of distinct) out[d.name] = distinctValue(out[d.name], i, d);
      return out;
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
    const argsArb = fc.tuple(
      ...(spec.params ?? []).map((p) => (p.nullable ? fc.option(baseColArb(p, eff, k), { nil: null, freq: 4 }) : baseColArb(p, eff, k)))
    );
    return fc.tuple(fc.record(shape), argsArb).map(([tables, args]) => ({ cutoffs: eff, args: args as unknown[], tables }));
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
  return { cutoffs, args: d.args, tables, subMicrosecondNormalised: lost };
}
