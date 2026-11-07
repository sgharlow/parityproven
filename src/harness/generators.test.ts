import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  quantityArb,
  cutoffPairArb,
  hasSubMicrosecondPrecision,
  ticksToSqlServerString,
  ticksToPostgresString,
} from "./generators.js";

describe("quantityArb", () => {
  it("produces fractional values frequently enough to expose the TRUNC/ROUND trap", () => {
    const samples = fc.sample(quantityArb, { numRuns: 200, seed: 42 });
    const fractional = samples.filter((q) => q % 1 !== 0);
    // With weight 3:1:1, we expect fractionals to dominate — at least 40%
    expect(fractional.length).toBeGreaterThan(80);
  });

  it("produces negative fractional values", () => {
    const samples = fc.sample(quantityArb, { numRuns: 500, seed: 99 });
    const negFrac = samples.filter((q) => q < 0 && q % 1 !== 0);
    expect(negFrac.length).toBeGreaterThan(0);
  });
});

describe("cutoffPairArb", () => {
  it("always produces lastCutoff < newCutoff", () => {
    fc.assert(
      fc.property(cutoffPairArb, ({ lastCutoff, newCutoff }) => {
        return lastCutoff < newCutoff;
      }),
      { numRuns: 500, seed: 1 }
    );
  });
});

describe("hasSubMicrosecondPrecision", () => {
  it("returns true for values with sub-microsecond ticks", () => {
    expect(hasSubMicrosecondPrecision(10001n)).toBe(true); // 10001 % 10 = 1
    expect(hasSubMicrosecondPrecision(10005n)).toBe(true);
  });

  it("returns false for exact microsecond values", () => {
    expect(hasSubMicrosecondPrecision(10000n)).toBe(false); // 10000 % 10 = 0
    expect(hasSubMicrosecondPrecision(20000n)).toBe(false);
  });
});

describe("ticksToSqlServerString / ticksToPostgresString", () => {
  it("PostgreSQL string is always parseable as a date", () => {
    const samples = fc.sample(
      fc.bigInt({ min: 1_000_000n, max: 1_000_000_000_000n }),
      { numRuns: 50, seed: 7 }
    );
    for (const t of samples) {
      const s = ticksToPostgresString(t);
      const d = new Date(s);
      expect(isNaN(d.getTime())).toBe(false);
    }
  });
});
