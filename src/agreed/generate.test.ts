import { describe, it, expect } from "vitest";
import { pgCases, pgScript, splitBatches, tsqltScript, unsupportedFeatures, type ExpectedFile } from "./generate.js";
import { specByName } from "../conversions/specs.js";
import type { ObjectSpec } from "../harness/generic/spec.js";

// A real spec with tables and fixed cases; the expected file only needs matching labels and columns for script generation.
const spec = specByName("Person.vStateProvinceCountryRegion")!;
const expected: ExpectedFile = {
  object: "Person.vStateProvinceCountryRegion", database: spec.database, capturedFrom: "", capturedAt: "", review: "",
  cases: (spec.fixedCases ?? []).map((fc) => ({ label: fc.label, columns: [{ name: "StateProvinceID", sqlServerType: "int" }], rows: [["n:1"]] })),
} as ExpectedFile;
const tableNames = spec.tables.map((t) => `[${t.schema}].[${t.name}]`);

describe("tsqltScript: schema-bound objects", () => {
  it("fakes every table with tSQLt.FakeTable by default", () => {
    const script = tsqltScript(spec, expected);
    for (const t of tableNames) expect(script).toContain(`EXEC tSQLt.FakeTable @TableName = N'${t}';`);
    expect(script).not.toContain("DELETE FROM");
  });

  it("empties every table with DELETE instead when the object is WITH SCHEMABINDING (FakeTable cannot rename them)", () => {
    const script = tsqltScript(spec, expected, { schemaBound: true });
    expect(script).not.toContain("EXEC tSQLt.FakeTable");
    for (const t of tableNames) expect(script).toContain(`DELETE FROM ${t};`);
    // once per table per case, before that case's inserts
    expect(script.split("DELETE FROM").length - 1).toBe(tableNames.length * (spec.fixedCases ?? []).length);
    const firstCase = script.slice(script.indexOf("CREATE PROCEDURE"));
    expect(firstCase.indexOf("DELETE FROM")).toBeLessThan(firstCase.indexOf("INSERT INTO"));
    // the DELETE relies on tSQLt's rollback, so the test must not be NoTransaction
    expect(script).not.toContain("NoTransaction](DEFAULT)\nCREATE PROCEDURE");
  });

  it("refuses a schema-bound object with state tests (outside tSQLt's transaction a DELETE would not be rolled back)", () => {
    const stateSpec = { ...spec, stateCheck: { tables: [], sqlServerErrors: [], postgresCodes: [] } } as unknown as ObjectSpec;
    expect(() => tsqltScript(stateSpec, expected, { schemaBound: true })).toThrow(/schema-bound object with state tests/);
  });
});

describe("declared result errors (spec.resultErrorClasses)", () => {
  const bom = specByName("dbo.uspGetBillOfMaterials")!;
  const cols = [{ name: "ProductAssemblyID", sqlServerType: "int" }];
  // case 1 raised the declared error on SQL Server; the others completed
  const exp: ExpectedFile = {
    object: "dbo.uspGetBillOfMaterials", database: bom.database, capturedFrom: "", capturedAt: "", review: "",
    cases: (bom.fixedCases ?? []).map((fc, i) => (i === 0
      ? { label: fc.label, columns: cols, raised: "raised: maximum recursion (25) exhausted" }
      : { label: fc.label, columns: cols, rows: [["n:1"]] })),
  } as ExpectedFile;

  it("is no longer an unsupported feature", () => {
    expect(unsupportedFeatures(bom)).toEqual([]);
  });

  it("tSQLt: each case asserts its outcome; only the declared error numbers count; rows only when it completed", () => {
    const tests = splitBatches(tsqltScript(bom, exp)).filter((b) => b.includes("CREATE PROCEDURE"));
    expect(tests).toHaveLength((bom.fixedCases ?? []).length);
    for (const t of tests) {
      expect(t).toContain("WHEN ERROR_NUMBER() IN (530) THEN N'raised: maximum recursion (25) exhausted'");
      expect(t).toContain("ELSE N'unexpected error '");
    }
    expect(tests[0]).toContain("@Expected = N'raised: maximum recursion (25) exhausted', @Actual = @outcome");
    expect(tests[0]).not.toContain("AssertEqualsTable");
    expect(tests[1]).toContain("@Expected = N'completed', @Actual = @outcome");
    expect(tests[1]).toContain("AssertEqualsTable");
  });

  it("PostgreSQL: the call is caught only for the declared SQLSTATE; rows compared only when it completed", () => {
    const cases = pgCases(pgScript(bom, exp));
    expect(cases).toHaveLength((bom.fixedCases ?? []).length);
    for (const c of cases) {
      expect(c.sql).toContain("WHEN SQLSTATE '54001' THEN INSERT INTO pp_outcome VALUES ('raised: maximum recursion (25) exhausted')");
      expect(c.sql).toContain("WITH NO DATA;");
    }
    expect(cases[0].sql).toContain("SELECT 'raised: maximum recursion (25) exhausted'::text AS outcome");
    expect(cases[0].sql).not.toContain("SELECT * FROM pp_expected");
    expect(cases[1].sql).toContain("SELECT 'completed'::text AS outcome");
    expect(cases[1].sql).toContain("SELECT * FROM pp_expected");
  });
});