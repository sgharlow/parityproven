/**
 * AdventureWorks2025 object specs. Tables come from catalog/ (SQL Server's own metadata);
 * what is written here is only what a person decides: the call, the order key, role overrides,
 * the runtime statement, and any planted defects worth naming.
 */

import type { ColSpec, ObjectSpec } from "../harness/generic/spec.js";
import { specFromCatalog, type CatalogOptions } from "./catalog.js";

const DB = "AdventureWorks2025";
const ref = (name: string): ColSpec => ({ name, type: { kind: "int" }, role: "ref" });
const tiny = (name: string, special: number[]): ColSpec => ({ name, type: { kind: "tinyint" }, nullable: true, special });
const dtm = (name: string): ColSpec => ({ name, type: { kind: "datetime" } });

/** Set-based runtime statements: `calls` invocations of a scalar function inside ONE statement. */
function scalarBench(o: {
  ssFn: string; pgFn: string; ssArgs: string; pgArgs: string; calls: number;
  ssAgg?: string; pgAgg?: string;   // templates containing {call}
}): { benchSs: string; benchPg: string } {
  const ssCall = `${o.ssFn}(${o.ssArgs})`;
  const pgCall = `${o.pgFn}(${o.pgArgs})`;
  return {
    benchSs: `SELECT ${(o.ssAgg ?? "COUNT_BIG({call})").replace("{call}", ssCall)} AS total FROM (SELECT TOP (${o.calls}) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_columns AS a CROSS JOIN sys.all_columns AS b) AS v`,
    benchPg: `SELECT ${(o.pgAgg ?? "count({call})").replace("{call}", pgCall)} AS total FROM generate_series(1, ${o.calls}) AS n`,
  };
}

/** Why scalar functions called once per row miss step 4. Measured, not assumed: see sys.sql_modules.is_inlineable. */
const UDF_INLINING =
  "Step 4 finding: SQL Server 2025 inlines this scalar function into the calling query (sys.sql_modules.is_inlineable = 1, Froid). PostgreSQL runs the function once per call, so per-row calls cost about 2x more at 20,000 calls. Equivalence is unaffected; a caller that needs the speed would inline the expression or use a set-based join.";

const MONEY_SUM = { ssAgg: "SUM(CAST({call} AS decimal(38,4)))", pgAgg: "sum({call})" };
const MAX_AGG = { ssAgg: "MAX({call})", pgAgg: "max({call})" };

const noTables = (qualified: string, pgFunction: string, extra: Partial<ObjectSpec>): ObjectSpec =>
  specFromCatalog(DB, qualified, { orderKey: [], mutants: [], pgFunction, ...extra } as never);

// Price/cost history: one period per product so "SELECT @x = ..." has at most one matching row.
// (With overlapping periods SQL Server keeps the last row it reads and PostgreSQL the first; neither is defined.)
const ONE_PERIOD: CatalogOptions = {
  roles: {
    "Production.ProductListPriceHistory.ProductID": "pk",
    "Production.ProductCostHistory.ProductID": "pk",
  },
};

const priceFn = (name: string, pgName: string): ObjectSpec =>
  specFromCatalog(
    DB, `dbo.${name}`,
    {
      orderKey: [], mutants: [], pgFunction: `dbo.${pgName}`,
      params: [ref("ProductID"), dtm("OrderDate")],
      ssCall: `SELECT dbo.${name}(?, ?) AS result`,
      pgCall: "SELECT {fn}($1::integer, $2::timestamp) AS result",
      // 20,000 calls so per-call execution dominates the timing (not statement start-up)
      benchVolume: 2000,
      ...scalarBench({ ssFn: `dbo.${name}`, pgFn: `dbo.${pgName}`, ssArgs: "(v.n % 2000) + 1, CAST('2020-01-02T12:00:00.000' AS datetime)", pgArgs: "(n % 2000) + 1, TIMESTAMP '2020-01-02 12:00:00'", calls: 20000, ...MONEY_SUM }),
      notes: [
        "At most one price period per product (precondition): with overlapping periods the T-SQL `SELECT @x = ...` keeps the last row read, which is undefined.",
        UDF_INLINING,
      ],
    },
    ONE_PERIOD
  );

const statusFn = (name: string, pgName: string, special: number[]): ObjectSpec =>
  noTables(`dbo.${name}`, `dbo.${pgName}`, {
    params: [tiny("Status", special)],
    ssCall: `SELECT dbo.${name}(?) AS result`,
    pgCall: "SELECT {fn}($1::smallint) AS result",
    benchVolume: 10,
    ...scalarBench({ ssFn: `dbo.${name}`, pgFn: `dbo.${pgName}`, ssArgs: "CAST(v.n % 8 AS tinyint)", pgArgs: "(n % 8)::smallint", calls: 20000, ssAgg: "SUM(LEN({call}))", pgAgg: "sum(length({call}))" }),
  });

export const AW_SPECS: ObjectSpec[] = [
  noTables("dbo.ufnGetAccountingStartDate", "dbo.ufn_get_accounting_start_date", {
    ssCall: "SELECT dbo.ufnGetAccountingStartDate() AS result",
    pgCall: "SELECT {fn}() AS result",
    benchVolume: 10,
    ...scalarBench({ ssFn: "dbo.ufnGetAccountingStartDate", pgFn: "dbo.ufn_get_accounting_start_date", ssArgs: "", pgArgs: "", calls: 20000, ...MAX_AGG }),
    mutants: [{ name: "start date one day late", from: "2003-07-01", to: "2003-07-02" }],
  }),
  noTables("dbo.ufnGetAccountingEndDate", "dbo.ufn_get_accounting_end_date", {
    ssCall: "SELECT dbo.ufnGetAccountingEndDate() AS result",
    pgCall: "SELECT {fn}() AS result",
    benchVolume: 10,
    ...scalarBench({ ssFn: "dbo.ufnGetAccountingEndDate", pgFn: "dbo.ufn_get_accounting_end_date", ssArgs: "", pgArgs: "", calls: 20000, ...MAX_AGG }),
    mutants: [{ name: "end date is exactly 2 ms before midnight (datetime would give .997)", from: "23:59:59.997", to: "23:59:59.998" }],
    notes: ["DATEADD(millisecond, -2, '20040701') on datetime rounds to .997, not .998: SQL Server datetime has 3.33 ms resolution."],
  }),
  statusFn("ufnGetDocumentStatusText", "ufn_get_document_status_text", [1, 2, 3, 4]),
  statusFn("ufnGetPurchaseOrderStatusText", "ufn_get_purchase_order_status_text", [1, 2, 3, 4, 5]),
  statusFn("ufnGetSalesOrderStatusText", "ufn_get_sales_order_status_text", [1, 2, 3, 4, 5, 6, 7]),
  priceFn("ufnGetProductDealerPrice", "ufn_get_product_dealer_price"),
  priceFn("ufnGetProductListPrice", "ufn_get_product_list_price"),
  priceFn("ufnGetProductStandardCost", "ufn_get_product_standard_cost"),
  specFromCatalog(
    DB, "dbo.ufnGetStock",
    {
      orderKey: [], mutants: [], pgFunction: "dbo.ufn_get_stock",
      params: [ref("ProductID")],
      ssCall: "SELECT dbo.ufnGetStock(?) AS result",
      pgCall: "SELECT {fn}($1::integer) AS result",
      benchVolume: 2000,
      notes: [UDF_INLINING],
      ...scalarBench({ ssFn: "dbo.ufnGetStock", pgFn: "dbo.ufn_get_stock", ssArgs: "(v.n % 2000) + 1", pgArgs: "(n % 2000) + 1", calls: 20000, ssAgg: "SUM(CAST({call} AS bigint))", pgAgg: "sum({call})" }),
    },
    {
      // The function only counts LocationID = 6, so that value must be generated (it is a key in the real schema).
      roles: { "Production.ProductInventory.LocationID": "value" },
      columns: { "Production.ProductInventory.LocationID": { range: [1, 8], special: [6] } },
    }
  ),
  noTables("dbo.ufnLeadingZeros", "dbo.ufn_leading_zeros", {
    params: [{ name: "Value", type: { kind: "int" }, nullable: true, range: [-2147483648, 2147483647], special: [99999999, 100000000, -9999999, -10000000, 12345678, 2147483647, -2147483648] }],
    ssCall: "SELECT dbo.ufnLeadingZeros(?) AS result",
    pgCall: "SELECT {fn}($1::integer) AS result",
    benchVolume: 10,
    ...scalarBench({ ssFn: "dbo.ufnLeadingZeros", pgFn: "dbo.ufn_leading_zeros", ssArgs: "v.n * 7919", pgArgs: "n * 7919", calls: 20000, ssAgg: "SUM(LEN({call}))", pgAgg: "sum(length({call}))" }),
    notes: ["CONVERT(varchar(8), int) yields '*' when the number needs more than 8 characters; DATALENGTH counts bytes."],
  }),
];
