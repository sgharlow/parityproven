import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { baseColArb, datasetArb, distinctValue, materialise, microsToIso, normaliseTicks, T0 } from "./rows.js";
import type { ColSpec, ObjectSpec } from "./spec.js";

describe("microsToIso", () => {
  it("formats the epoch and whole seconds", () => {
    expect(microsToIso(0n)).toBe("1970-01-01T00:00:00.000000");
    expect(microsToIso(1_000_000n)).toBe("1970-01-01T00:00:01.000000");
  });
  it("keeps all six fractional digits", () => {
    expect(microsToIso(1n)).toBe("1970-01-01T00:00:00.000001");
    expect(microsToIso(999_999n)).toBe("1970-01-01T00:00:00.999999");
  });
  it("handles times before the epoch", () => {
    expect(microsToIso(-1n)).toBe("1969-12-31T23:59:59.999999");
    expect(microsToIso(-1_000_000n)).toBe("1969-12-31T23:59:59.000000");
  });
  it("formats the harness base time T0", () => {
    expect(microsToIso(T0 / 10n)).toBe("2020-01-01T00:00:00.000000");
  });
});

describe("normaliseTicks (100 ns -> µs)", () => {
  it("whole microseconds are kept and not counted as lost", () => {
    expect(normaliseTicks(T0 + 10n)).toEqual({ iso: "2020-01-01T00:00:00.000001", lost: false });
  });
  it("sub-microsecond ticks are truncated and counted as lost", () => {
    expect(normaliseTicks(T0 + 19n)).toEqual({ iso: "2020-01-01T00:00:00.000001", lost: true });
    expect(normaliseTicks(T0 + 1n)).toEqual({ iso: "2020-01-01T00:00:00.000000", lost: true });
  });
});

describe("materialise", () => {
  const spec: ObjectSpec = {
    database: "X", schema: "s", name: "o", objectClass: "procedure", windowParams: true, orderKey: [], pgFunction: "s.o", mutants: [],
    tables: [{ schema: "s", name: "t", columns: [{ name: "Id", type: { kind: "int" }, role: "pk" }, { name: "At", type: { kind: "datetime2" } }] }],
  };
  it("counts every datetime2 value (and cutoff) that lost sub-microsecond ticks", () => {
    const m = materialise(spec, {
      cutoffs: { last: T0 + 5n, new: T0 + 20n },
      args: [],
      tables: { "s.t": [{ Id: 1, At: T0 + 3n }, { Id: 2, At: T0 + 30n }] },
    });
    expect(m.subMicrosecondNormalised).toBe(2);   // last cutoff (5) and the first row (3)
    expect(m.cutoffs).toEqual({ last: "2020-01-01T00:00:00.000000", new: "2020-01-01T00:00:00.000002" });
    expect(m.tables["s.t"][1].At).toBe("2020-01-01T00:00:00.000003");
  });
});

describe("distinctValue", () => {
  const col: ColSpec = { name: "n", type: { kind: "nvarchar", n: 10 } };
  it("makes values distinct per row and keeps them within the column length", () => {
    const a = distinctValue("same", 0, col);
    const b = distinctValue("same", 1, col);
    expect(a).not.toBe(b);
    expect(String(a).length).toBeLessThanOrEqual(10);
    expect(String(distinctValue("a very long value", 7, col)).length).toBeLessThanOrEqual(10);
  });
  it("leaves NULL alone", () => {
    expect(distinctValue(null, 3, col)).toBeNull();
  });
});

// Property tests: every generated value fits the SQL type it is declared as, so a failure is never a load-time artefact.
describe("generated values fit their declared types", () => {
  const sample = (col: ColSpec, runs = 300) => fc.sample(baseColArb(col, null, 3), { numRuns: runs, seed: 42 });

  it.each([[18, 2], [18, 3], [10, 2], [5, 0], [19, 4]])("decimal(%i,%i): precision and scale", (p, s) => {
    for (const v of sample({ name: "d", type: { kind: "decimal", p, s } })) {
      const m = String(v).match(/^(-?)(\d+)(?:\.(\d+))?$/);
      expect(m, String(v)).not.toBeNull();
      expect((m![3] ?? "").length).toBe(s);
      expect(m![2].replace(/^0+(?=\d)/, "").length).toBeLessThanOrEqual(p - s);
    }
  });
  it("char(n) and nvarchar(n) respect their length", () => {
    for (const n of [1, 2, 5]) {
      for (const v of sample({ name: "c", type: { kind: "char", n } })) expect(String(v).length).toBeLessThanOrEqual(n);
      for (const v of sample({ name: "s", type: { kind: "nvarchar", n } })) expect(String(v).length).toBeLessThanOrEqual(Math.max(n, 4));
    }
  });
  it("tinyint stays in 0..255, smallint in its range", () => {
    for (const v of sample({ name: "t", type: { kind: "tinyint" } })) expect(v as number).toBeGreaterThanOrEqual(0), expect(v as number).toBeLessThanOrEqual(255);
    for (const v of sample({ name: "t", type: { kind: "smallint" } })) expect(Math.abs(v as number)).toBeLessThanOrEqual(32768);
  });
  it("an explicit range bounds integers", () => {
    for (const v of sample({ name: "i", type: { kind: "int" }, range: [3, 7] })) expect(v as number).toBeGreaterThanOrEqual(3), expect(v as number).toBeLessThanOrEqual(7);
  });
  it("ref columns draw from the key universe (1..k, plus one dangling key)", () => {
    for (const v of sample({ name: "r", type: { kind: "int" }, role: "ref" })) expect([1, 2, 3, 4]).toContain(v);
  });
  it("datetime values are ones SQL Server datetime can represent (.000/.003/.007)", () => {
    for (const v of sample({ name: "when", type: { kind: "datetime" } })) expect(String(v)).toMatch(/\.\d\d[037]$/);
  });
  it("dates are ISO yyyy-mm-dd", () => {
    for (const v of sample({ name: "d", type: { kind: "date" } })) expect(String(v)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("a column vocabulary dominates text generation", () => {
    const vals = sample({ name: "s", type: { kind: "nvarchar", n: 20 }, strings: ["alpha"] }, 400);
    expect(vals.filter((v) => v === "alpha").length).toBeGreaterThan(200);
  });
  it("trueFraction biases bit columns", () => {
    const vals = sample({ name: "b", type: { kind: "bit" }, trueFraction: 0.1 }, 1000);
    expect(vals.filter((v) => v === true).length).toBeLessThan(200);
  });
});

describe("datasetArb", () => {
  const spec: ObjectSpec = {
    database: "X", schema: "s", name: "o", objectClass: "procedure", windowParams: false, orderKey: [], pgFunction: "s.o", mutants: [],
    tables: [
      {
        schema: "s", name: "t", rows: [2, 4],
        columns: [
          { name: "Id", type: { kind: "int" }, role: "pk" },
          { name: "Seq", type: { kind: "int" }, role: "seq", offset: 10 },
          { name: "Name", type: { kind: "nvarchar", n: 8 }, distinct: true },
          { name: "Opt", type: { kind: "int" }, nullable: true, nullFraction: 0.5 },
        ],
      },
    ],
  };
  it("pk columns are 1..n, seq columns offset+1..offset+n, distinct columns distinct, row count within bounds", () => {
    fc.assert(fc.property(datasetArb(spec), (d) => {
      const rows = d.tables["s.t"];
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.length).toBeLessThanOrEqual(4);
      rows.forEach((r, i) => { expect(r.Id).toBe(i + 1); expect(r.Seq).toBe(11 + i); });
      const names = rows.map((r) => r.Name);
      expect(new Set(names).size).toBe(names.length);
    }), { numRuns: 100, seed: 7 });
  }, 30_000);
  // generating datasets takes a few seconds: explicit timeout (the 5 s default made this test flaky)
  it("nullFraction controls how often a nullable column is NULL", () => {
    const all = fc.sample(datasetArb(spec), { numRuns: 150, seed: 9 }).flatMap((d) => d.tables["s.t"]);
    const nulls = all.filter((r) => r.Opt === null).length / all.length;
    expect(nulls).toBeGreaterThan(0.3);
    expect(nulls).toBeLessThan(0.7);
  }, 30_000);
});
