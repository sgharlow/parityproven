import { describe, it, expect } from "vitest";
import { inputCell, pgCases, pgLiteral, pgScript, splitBatches, ssClientScript, ssLiteral, tsqltScript, unsupportedFeatures, type ExpectedFile } from "./generate.js";
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
  const cols = [{ name: "ProductAssemblyID", sqlServerType: "int" }, { name: "ComponentID", sqlServerType: "int" }, { name: "BOMLevel", sqlServerType: "int" }];
  // case 1 raised the declared error on SQL Server; the others completed
  const exp: ExpectedFile = {
    object: "dbo.uspGetBillOfMaterials", database: bom.database, capturedFrom: "", capturedAt: "", review: "",
    cases: (bom.fixedCases ?? []).map((fc, i) => (i === 0
      ? { label: fc.label, columns: cols, raised: "raised: maximum recursion (25) exhausted" }
      : { label: fc.label, columns: cols, rows: [["n:1", "n:2", "n:0"]] })),
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
describe("order key (the source guarantees an order)", () => {
  const sh = specByName("Integration.GetStockHoldingUpdates")!;
  const cols = [{ name: "WWI Stock Item ID", sqlServerType: "int" }, { name: "Bin Location", sqlServerType: "nvarchar(20)" }];
  const exp: ExpectedFile = {
    object: "Integration.GetStockHoldingUpdates", database: sh.database, capturedFrom: "", capturedAt: "", review: "",
    cases: (sh.fixedCases ?? []).map((fc) => ({ label: fc.label, columns: cols, rows: [["n:2", "s:B"], ["n:1", "s:A"]] })),
  } as ExpectedFile;

  it("asserts the order-key sequence in the order SQL Server returned the rows", () => {
    const sql = pgCases(pgScript(sh, exp))[0].sql;
    expect(sql).toContain("SELECT row_number() OVER () AS pp_ord, pp_r.* FROM (");
    expect(sql).toContain("CREATE TEMP TABLE pp_expected_ord (pp_ord bigint, LIKE pp_actual) ON COMMIT DROP;");
    expect(sql).toContain("(1, '2', 'B'),\n  (2, '1', 'A')");
    expect(sql).toContain(`array_agg(ROW("WWI Stock Item ID")::text ORDER BY pp_ord) INTO got FROM pp_actual_ord`);
    expect(sql).toContain("rows are not in the order the original returns (order key WWI Stock Item ID)");
    expect(pgScript(sh, exp)).toContain("also asserts the order of the order key (WWI Stock Item ID)");
  });

  it("adds no order check when the source guarantees none", () => {
    expect(pgScript(spec, expected)).not.toContain("pp_actual_ord");
    expect(pgScript(spec, expected)).toContain("Row order is not asserted here");
  });

  it("refuses an order key that is not a result column", () => {
    const bad = { ...exp, cases: exp.cases.map((c) => ({ ...c, columns: [cols[1]!], rows: [["s:A"]] })) } as ExpectedFile;
    expect(() => pgScript(sh, bad)).toThrow(/order key column\(s\) WWI Stock Item ID not in the result/);
  });
});

describe("geography and xml", () => {
  it("geography points are canonical WKT, written in each engine's own spelling", () => {
    expect(inputCell("POINT(-122.3 47.6)", { kind: "geography" })).toBe("g:POINT(-122.3 47.6)");
    expect(inputCell("POINT (-122.30 47.60)", { kind: "geography" })).toBe("g:POINT(-122.3 47.6)");
    expect(ssLiteral("g:POINT(-122.3 47.6)")).toBe("N'POINT (-122.3 47.6)'");   // STAsText spelling
    expect(pgLiteral("g:POINT(-122.3 47.6)")).toBe("'POINT(-122.3 47.6)'");     // ST_AsText spelling
    expect(() => inputCell("LINESTRING(0 0, 1 1)", { kind: "geography" })).toThrow();
  });

  it("xml values travel as text", () => {
    expect(inputCell("<a b=\"1\"/>", { kind: "xml" })).toBe("s:<a b=\"1\"/>");
  });

  const vic = specByName("Sales.vIndividualCustomer")!;
  const xmlCols = [{ name: "BusinessEntityID", sqlServerType: "int" }, { name: "Demographics", sqlServerType: "xml" }];
  const exp: ExpectedFile = {
    object: "Sales.vIndividualCustomer", database: vic.database, capturedFrom: "", capturedAt: "", review: "",
    cases: (vic.fixedCases ?? []).map((fc) => ({ label: fc.label, columns: xmlCols, rows: [["n:1", "s:<x/>"]] })),
  } as ExpectedFile;

  it("a view with an xml column is no longer unsupported", () => {
    expect(unsupportedFeatures(vic)).toEqual([]);
  });

  it("xml result columns are compared as text: nvarchar(max) in tSQLt, ::text on PostgreSQL", () => {
    const ss = tsqltScript(vic, exp);
    expect(ss).toContain("[Demographics] nvarchar(max) NULL");
    expect(ss).not.toMatch(/\[Demographics\] xml NULL/);
    // xml does not convert to nvarchar implicitly on SQL Server (seen 2026-11-18): the insert converts it explicitly
    expect(ss).toContain("SELECT [BusinessEntityID], CONVERT(nvarchar(max), [Demographics]) AS [Demographics] FROM (SELECT * FROM Sales.vIndividualCustomer) AS pp_q");
    const pg = pgCases(pgScript(vic, exp))[0].sql;
    expect(pg).toContain('SELECT "BusinessEntityID", "Demographics"::text AS "Demographics" FROM (');
  });
});
describe("FOR JSON procedures (ruling J1)", () => {
  const s = specByName("Website.SearchForStockItems")!;
  const exp: ExpectedFile = {
    object: "Website.SearchForStockItems", database: s.database, capturedFrom: "", capturedAt: "", review: "",
    cases: (s.fixedCases ?? []).map((fc, i) => ({ label: fc.label, columns: [{ name: "result", sqlServerType: "nvarchar(max)" }], rows: [[i === 0 ? "∅" : 's:{"StockItems":[{"StockItemID":1}]}']] })),
  } as ExpectedFile;

  it("are supported: no tSQLt script, a client re-run script that says so, and jsonb comparison on PostgreSQL", () => {
    expect(unsupportedFeatures(s)).toEqual([]);
    expect(() => tsqltScript(s, exp)).toThrow(/no tSQLt script \(ruling J1\)/);
    const ss = ssClientScript(s, exp);
    expect(ss).toContain("not tSQLt (ruling J1)");
    expect(ss).toContain("EXEC Website.SearchForStockItems @SearchText = ");
    expect(ss).toContain('-- expected document: {"StockItems":[{"StockItemID":1}]}');
    expect(ss).toContain("-- expected document: (no rows)");
    const pg = pgCases(pgScript(s, exp));
    expect(pg[0].sql).toContain("IS DISTINCT FROM NULL::jsonb");
    expect(pg[1].sql).toContain(`IS DISTINCT FROM '{"StockItems":[{"StockItemID":1}]}'::jsonb`);
    expect(pg[1].sql).toContain("agreed test failed (%): the JSON document differs");
  });
});
describe("per-case setup and state observation queries (tranche C)", () => {
  const s = specByName("Sequences.ReseedSequenceBeyondTableValues")!;
  const exp: ExpectedFile = {
    object: "Sequences.ReseedSequenceBeyondTableValues", database: s.database, capturedFrom: "", capturedAt: "", review: "",
    cases: (s.fixedCases ?? []).map((fc) => ({
      label: fc.label, outcome: "completed", tables: {},
      queries: [{ label: "next value of each sequence after the call", columns: [{ name: "OrderID", sqlServerType: "int" }, { name: "StockItemID", sqlServerType: "int" }], rows: [["n:11", "n:1"]] }],
    })),
  } as ExpectedFile;
  it("is supported, and each test sets up, calls, observes, undoes the setup and only then asserts", () => {
    expect(unsupportedFeatures(s)).toEqual([]);
    const ss = tsqltScript(s, exp);
    const body = ss.split("-- case 1:")[1].split("\nGO\n")[0];
    const at = (x: string): number => { const i = body.indexOf(x); expect(i, x).toBeGreaterThan(-1); return i; };
    const teardown = body.lastIndexOf("DROP SEQUENCE Sequences.[OrderID]");   // the setup drops first, the teardown last
    expect(at("CREATE SEQUENCE Sequences.[OrderID]")).toBeLessThan(at("EXEC Sequences.ReseedSequenceBeyondTableValues"));
    expect(at("EXEC Sequences.ReseedSequenceBeyondTableValues")).toBeLessThan(at("INSERT INTO #ActualQuery1"));
    expect(at("INSERT INTO #ActualQuery1")).toBeLessThan(teardown);
    expect(teardown).toBeLessThan(at("tSQLt.AssertEqualsString"));
    expect(teardown).toBeLessThan(at("tSQLt.AssertEqualsTable @Expected = N'#ExpectedQuery1'"));
    // no declared errors: the outcome is "completed" or an unexpected error, never an empty CASE
    expect(body).not.toMatch(/CASE\s+ELSE/);
    const pg = pgCases(pgScript(s, exp))[0].sql;
    expect(pg).toContain("CREATE SEQUENCE sequences.\"OrderID\"");
    expect(pg).toContain("CREATE TEMP TABLE pp_actual_query_1 ON COMMIT DROP AS");
    expect(pg).toContain("in next value of each sequence after the call");
  });
});
describe("table-valued parameters, identity columns and memory-optimized tables (tranche C)", () => {
  const s = specByName("Website.RecordColdRoomTemperatures")!;
  const exp: ExpectedFile = {
    object: "Website.RecordColdRoomTemperatures", database: s.database, capturedFrom: "", capturedAt: "", review: "",
    cases: (s.fixedCases ?? []).map((fc) => ({ label: fc.label, outcome: "completed", tables: { "Warehouse.ColdRoomTemperatures": { columns: ["ColdRoomSensorNumber", "RecordedWhen", "Temperature"], rows: [] } } })),
  } as ExpectedFile;
  it("is supported", () => {
    expect(unsupportedFeatures(s)).toEqual([]);
  });
  it("SQL Server: the readings fill a table variable (identity column not inserted) that the call passes; memory-optimized tables are emptied, not faked", () => {
    const ss = tsqltScript(s, exp);
    const body = ss.split("-- case 1:")[1].split("\nGO\n")[0];
    expect(body).toContain("DECLARE @tvp0 [Website].[SensorDataList];");
    expect(body).toContain("INSERT INTO @tvp0 ([ColdRoomSensorNumber], [RecordedWhen], [Temperature]) VALUES (3, ");
    expect(body).not.toContain("SensorDataListID], [");
    expect(body).toContain("EXEC Website.RecordColdRoomTemperatures @SensorReadings = @tvp0");
    expect(body).toContain("DELETE FROM [Warehouse].[ColdRoomTemperatures];");
    expect(body).not.toContain("FakeTable");
    expect(body).not.toMatch(/DELETE FROM \[Website\]\.\[SensorDataList\]/);
  });
  it("PostgreSQL: the readings are one JSON array at the parameter's position, numbered 1..n by the identity column", () => {
    const pg = pgCases(pgScript(s, exp))[0].sql;
    expect(pg).toContain("CALL website.record_cold_room_temperatures(website.sensor_data_list_from_json('[{");
    expect(pg).toContain('"SensorDataListID":1');
    expect(pg).toContain('"SensorDataListID":2');
    expect(pg).not.toContain("DELETE FROM website.sensor_data_list");
  });
});
describe("state objects with declared errors, dependencies and identity columns (tranche C)", () => {
  const s = specByName("Website.InsertCustomerOrders")!;
  const exp: ExpectedFile = {
    object: "Website.InsertCustomerOrders", database: s.database, capturedFrom: "", capturedAt: "", review: "",
    cases: (s.fixedCases ?? []).map((fc) => ({ label: fc.label, outcome: "completed", tables: {}, queries: (s.stateCheck!.queries ?? []).map((q) => ({ label: q.label, columns: [{ name: "X", sqlServerType: "int" }], rows: [] })) })),
  } as ExpectedFile;
  it("is supported although it depends on another object and uses setup statements", () => {
    expect(unsupportedFeatures(s)).toEqual([]);
    expect(s.dependencies).toEqual(["Website.CalculateCustomerPrice"]);
  });
  it("tables are emptied, not faked, so NOT NULL violations the original raises can be observed; both table-valued parameters are passed", () => {
    const body = tsqltScript(s, exp).split("-- case 1:")[1].split("\nGO\n")[0];
    expect(body).toContain("DELETE FROM [Sales].[Orders];");
    expect(body).not.toContain("FakeTable");
    expect(body).toContain("DECLARE @tvp0 [Website].[OrderList];");
    expect(body).toContain("DECLARE @tvp1 [Website].[OrderLineList];");
    expect(body).toContain("EXEC Website.InsertCustomerOrders @Orders = @tvp0, @OrderLines = @tvp1, @OrdersCreatedByPersonID = 1, @SalespersonPersonID = 2");
  });
  it("identity columns of a table are not inserted into; a fixed case that gives a value for one is refused", () => {
    const inv = specByName("Website.InvoiceCustomerOrders")!;
    expect(unsupportedFeatures(inv)).toEqual([]);
    const withValue = { ...inv, fixedCases: [{ label: "x", args: [5, 9], tables: { "Sales.InvoiceLines": [{ InvoiceLineID: 7, InvoiceID: 1 }] } }] } as typeof inv;
    expect(unsupportedFeatures(withValue)).toEqual(["a fixed case gives a value for the identity column of Sales.InvoiceLines"]);
  });
});
