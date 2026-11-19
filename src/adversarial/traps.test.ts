import { describe, it, expect } from "vitest";
import { applicableTraps, checkTrap } from "./traps.js";
import type { FixedCase, ObjectSpec } from "../harness/generic/spec.js";

const spec = {
  database: "T", schema: "dbo", name: "P", objectClass: "procedure", windowParams: false, orderKey: [], pgFunction: "dbo.p",
  tables: [
    {
      schema: "dbo", name: "T",
      columns: [
        { name: "Id", type: { kind: "int" }, role: "pk" },
        { name: "Name", type: { kind: "nvarchar", n: 20 }, nullable: true },
        { name: "Price", type: { kind: "decimal", p: 9, s: 3 } },
        { name: "Born", type: { kind: "datetime" } },
        { name: "Day", type: { kind: "date" } },
        { name: "Flag", type: { kind: "bit" } },
      ],
    },
  ],
} as unknown as ObjectSpec;

const fc = (rows: Record<string, unknown>[], extra: Partial<FixedCase> = {}): FixedCase => ({ label: "x", tables: { "dbo.T": rows }, ...extra });
const row = (o: Record<string, unknown>) => ({ Id: 1, Name: "a", Price: "1.000", Born: "2020-01-01T00:00:00", Day: "2020-01-01", Flag: 0, ...o });

describe("checkTrap", () => {
  it("null-vs-empty needs both an empty string and a NULL text input", () => {
    expect(checkTrap("null-vs-empty", spec, fc([row({ Name: "" }), row({ Id: 2, Name: null })])).present).toBe(true);
    expect(checkTrap("null-vs-empty", spec, fc([row({ Name: "" })])).present).toBe(false);
    expect(checkTrap("null-vs-empty", spec, fc([row({ Name: null })])).present).toBe(false);
    expect(checkTrap("null-vs-empty", spec, fc([row({ Name: "" }), row({ Id: 2, Born: null })])).present).toBe(false);
  });

  it("collation-case needs two values that differ only in case", () => {
    expect(checkTrap("collation-case", spec, fc([row({ Name: "Abc" }), row({ Id: 2, Name: "aBC" })])).present).toBe(true);
    expect(checkTrap("collation-case", spec, fc([row({ Name: "Abc" }), row({ Id: 2, Name: "Abc" })])).present).toBe(false);
    expect(checkTrap("collation-case", spec, fc([row({ Name: "Abc" }), row({ Id: 2, Name: "Abd" })])).present).toBe(false);
  });

  it("trailing-spaces needs a text value ending in a space", () => {
    expect(checkTrap("trailing-spaces", spec, fc([row({ Name: "a " })])).present).toBe(true);
    expect(checkTrap("trailing-spaces", spec, fc([row({ Name: " a" })])).present).toBe(false);
  });

  it("dates-datetime accepts boundary dates, off-grid datetimes and a cutoff equal to a row date", () => {
    expect(checkTrap("dates-datetime", spec, fc([row({ Day: "1753-01-01" })])).present).toBe(true);
    expect(checkTrap("dates-datetime", spec, fc([row({ Day: "9999-12-31" })])).present).toBe(true);
    expect(checkTrap("dates-datetime", spec, fc([row({ Born: "2020-01-01T00:00:00.005" })])).present).toBe(true);
    expect(checkTrap("dates-datetime", spec, fc([row({ Born: "2020-01-01T00:00:00.003" })])).present).toBe(false);
    expect(checkTrap("dates-datetime", spec, fc([row({ Born: "2020-01-01T00:00:00.0034" })])).present).toBe(true);
    expect(checkTrap("dates-datetime", spec, fc([row({})], { cutoffs: { last: "2019-01-01T00:00:00", new: "2020-01-01T00:00:00" } })).present).toBe(true);
    expect(checkTrap("dates-datetime", spec, fc([row({})], { cutoffs: { last: "2019-01-01T00:00:00", new: "2021-01-01T00:00:00" } })).present).toBe(false);
  });

  it("numeric-rounding needs a decimal whose last fractional digit is 5", () => {
    expect(checkTrap("numeric-rounding", spec, fc([row({ Price: "0.125" })])).present).toBe(true);
    expect(checkTrap("numeric-rounding", spec, fc([row({ Price: 2.5 })])).present).toBe(true);
    expect(checkTrap("numeric-rounding", spec, fc([row({ Price: "0.124" })])).present).toBe(false);
    expect(checkTrap("numeric-rounding", spec, fc([row({ Price: "5" })])).present).toBe(false);
  });

  it("top-ties needs two rows sharing a non-key value", () => {
    expect(checkTrap("top-ties", spec, fc([row({ Name: "x" }), row({ Id: 2, Name: "x" })])).present).toBe(true);
    expect(checkTrap("top-ties", spec, fc([row({ Name: "x", Price: "1" }), row({ Id: 2, Name: "y", Price: "2", Born: "2021-01-01T00:00:00", Day: "2021-01-01" })])).present).toBe(false);
    expect(checkTrap("top-ties", spec, fc([row({ Name: "x" })])).present).toBe(false);
  });

  it("identity-gaps needs a non-contiguous key run", () => {
    expect(checkTrap("identity-gaps", spec, fc([row({ Id: 1 }), row({ Id: 4, Name: "z" })])).present).toBe(true);
    expect(checkTrap("identity-gaps", spec, fc([row({ Id: 1 }), row({ Id: 2, Name: "z" })])).present).toBe(false);
  });

  it("reads arguments by parameter type", () => {
    const fn = { ...spec, tables: [], params: [{ name: "@s", type: { kind: "nvarchar", n: 10 } }] } as unknown as ObjectSpec;
    expect(checkTrap("trailing-spaces", fn, { label: "x", tables: {}, args: ["a "] }).present).toBe(true);
    expect(checkTrap("trailing-spaces", fn, { label: "x", tables: {}, args: ["a"] }).present).toBe(false);
  });
});

describe("applicableTraps", () => {
  it("derives applicability from the spec", () => {
    const a = applicableTraps(spec);
    expect(Object.values(a).every((x) => x.applicable)).toBe(true);
    const fn = { ...spec, objectClass: "function", tables: [], params: [{ name: "@n", type: { kind: "int" } }] } as unknown as ObjectSpec;
    const b = applicableTraps(fn);
    for (const t of ["null-vs-empty", "collation-case", "trailing-spaces", "dates-datetime", "numeric-rounding", "top-ties", "identity-gaps"] as const)
      expect(b[t].applicable).toBe(false);
    expect(applicableTraps({ ...fn, windowParams: true } as ObjectSpec)["dates-datetime"].applicable).toBe(true);
    expect(applicableTraps({ ...fn, setup: { sqlServer: ["x"], postgres: [] } } as ObjectSpec)["identity-gaps"].applicable).toBe(true);
  });
});
