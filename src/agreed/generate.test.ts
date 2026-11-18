import { describe, it, expect } from "vitest";
import { tsqltScript, type ExpectedFile } from "./generate.js";
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
