/**
 * AdventureWorks2025 object specs. Tables come from catalog/ (SQL Server's own metadata);
 * what is written here is only what a person decides: the call, the order key, role overrides,
 * the runtime statement, and any planted defects worth naming.
 */

import type { ColSpec, FixedCase, ObjectSpec, Row } from "../harness/generic/spec.js";
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
  "Step 4 finding: SQL Server 2025 inlines this scalar function into the calling query (sys.sql_modules.is_inlineable = 1, Froid). PostgreSQL runs the function once per call, so per-row calls cost about 2x more at 20,000 calls. Equivalence is unaffected; a caller that needs the speed would inline the expression or use a set-based join. A PL/pgSQL version (dbo.ufnGetStock, 2026-11-12) measured slower than the LANGUAGE sql one (160 ms vs 123 ms at 20,000 calls), so the SQL version is kept.";

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
      // argument name only steers generation; "OrderDate" would pick up the fiscal-year dates meant for SalesOrderHeader
      params: [ref("ProductID"), dtm("PricingInstant")],
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

/**
 * Fixed cases for a CASE @Status ... ELSE N'** Invalid **' function (hand-derived from the source): every mapped value,
 * 0 (below the first), the first unmapped value above the last, 255 (tinyint maximum), and NULL (CASE NULL WHEN ...
 * matches no WHEN, so it takes the ELSE branch, not NULL).
 */
function statusCases(texts: string[]): FixedCase[] {
  const mapped = texts.map((t, i): FixedCase => ({ label: `status ${i + 1} maps to '${t}'`, args: [i + 1], tables: {} }));
  return [
    ...mapped,
    { label: "status 0 (below the first mapped value) is '** Invalid **'", args: [0], tables: {} },
    { label: `status ${texts.length + 1} (first value above the last mapped one) is '** Invalid **'`, args: [texts.length + 1], tables: {} },
    { label: "status 255 (tinyint maximum) is '** Invalid **'", args: [255], tables: {} },
    { label: "NULL status takes the ELSE branch: '** Invalid **', not NULL", args: [null], tables: {} },
  ];
}

const statusFn = (name: string, pgName: string, special: number[], texts: string[]): ObjectSpec =>
  noTables(`dbo.${name}`, `dbo.${pgName}`, {
    fixedCases: statusCases(texts),
    params: [tiny("Status", special)],
    ssCall: `SELECT dbo.${name}(?) AS result`,
    pgCall: "SELECT {fn}($1::smallint) AS result",
    benchVolume: 10,
    ...scalarBench({ ssFn: `dbo.${name}`, pgFn: `dbo.${pgName}`, ssArgs: "CAST(v.n % 8 AS tinyint)", pgArgs: "(n % 8)::smallint", calls: 20000, ssAgg: "SUM(LEN({call}))", pgAgg: "sum(length({call}))" }),
  });

/**
 * Plain projection views. pgFunction is the PostgreSQL view name. orderKey is [] (views have no order).
 * Mutants are generated automatically from the conversion text.
 * Views whose Person/Address joins fan out (one row per email x phone) are kept small by the key universe.
 */
const view = (qualified: string, pgName: string, opts: CatalogOptions = {}): ObjectSpec =>
  specFromCatalog(DB, qualified, { orderKey: [], mutants: [], pgFunction: pgName }, opts);

export const AW_VIEWS: ObjectSpec[] = [
  {
    ...view("Person.vStateProvinceCountryRegion", "person.v_state_province_country_region"),
    fixedCases: stateProvinceCases(),
    mutants: [
      // both sides: an explicit collation on either side of '=' applies to the comparison, so dropping one is unobservable
      { name: "join is case-sensitive (collation dropped)", from: " COLLATE tsql_compat.ci_as_equal = rtrim(cr.\"CountryRegionCode\", ' ') COLLATE tsql_compat.ci_as_equal;", to: " = rtrim(cr.\"CountryRegionCode\", ' ');" },
      { name: "trailing spaces count in the join (rtrim dropped)", from: "rtrim(sp.\"CountryRegionCode\", ' ') COLLATE", to: "sp.\"CountryRegionCode\" COLLATE" },
      { name: "inner join made a left join (provinces of unknown countries kept)", from: "INNER JOIN person.country_region cr", to: "LEFT JOIN person.country_region cr" },
    ],
    notes: [
      "Finding (step 2, 2026-11-18): Kiro's draft joined CountryRegionCode with PostgreSQL '=', which is case-sensitive and counts trailing spaces. Under the source collation (SQL_Latin1_General_CP1_CI_AS) 'us' joins 'US' and 'CA ' joins 'CA'. Step 3 passed because the generated codes never differed only in case or trailing spaces; the fixed cases 'collation' and 'trailing space' failed on PostgreSQL. Fixed in the conversion (rtrim + a case-insensitive ICU collation in the join); both cases are kept as regression cases.",
    ],
  },
  { ...view("HumanResources.vEmployeeDepartment", "humanresources.v_employee_department"), fixedCases: [employeeDepartmentCase()] },
  { ...view("HumanResources.vEmployeeDepartmentHistory", "humanresources.v_employee_department_history"), fixedCases: [employeeDepartmentHistoryCase()] },
  { ...view("Production.vProductAndDescription", "production.v_product_and_description"), fixedCases: [productAndDescriptionCase()] },
  view("Purchasing.vVendorWithAddresses", "purchasing.v_vendor_with_addresses"),
  view("Purchasing.vVendorWithContacts", "purchasing.v_vendor_with_contacts"),
  { ...view("Sales.vSalesPerson", "sales.v_sales_person"), fixedCases: [salesPersonCase()] },
  view("Sales.vStoreWithAddresses", "sales.v_store_with_addresses"),
  view("Sales.vStoreWithContacts", "sales.v_store_with_contacts"),
  view("Sales.vSalesPersonSalesByFiscalYears", "sales.v_sales_person_sales_by_fiscal_years", {
    columns: { "Sales.SalesOrderHeader.OrderDate": { special: [] } },
  }),
];

export const AW_SPECS: ObjectSpec[] = [
  noTables("dbo.ufnGetAccountingStartDate", "dbo.ufn_get_accounting_start_date", {
    ssCall: "SELECT dbo.ufnGetAccountingStartDate() AS result",
    pgCall: "SELECT {fn}() AS result",
    benchVolume: 10,
    ...scalarBench({ ssFn: "dbo.ufnGetAccountingStartDate", pgFn: "dbo.ufn_get_accounting_start_date", ssArgs: "", pgArgs: "", calls: 20000, ...MAX_AGG }),
    mutants: [{ name: "start date one day late", from: "2003-07-01", to: "2003-07-02" }],
    fixedCases: [{ label: "'20030701' with style 112 is 2003-07-01 00:00:00.000 (midnight, datetime)", args: [], tables: {} }],
  }),
  noTables("dbo.ufnGetAccountingEndDate", "dbo.ufn_get_accounting_end_date", {
    ssCall: "SELECT dbo.ufnGetAccountingEndDate() AS result",
    pgCall: "SELECT {fn}() AS result",
    benchVolume: 10,
    ...scalarBench({ ssFn: "dbo.ufnGetAccountingEndDate", pgFn: "dbo.ufn_get_accounting_end_date", ssArgs: "", pgArgs: "", calls: 20000, ...MAX_AGG }),
    mutants: [{ name: "end date is exactly 2 ms before midnight (datetime would give .997)", from: "23:59:59.997", to: "23:59:59.998" }],
    notes: ["DATEADD(millisecond, -2, '20040701') on datetime rounds to .997, not .998: SQL Server datetime has 3.33 ms resolution."],
    fixedCases: [{ label: "2 ms before 2004-07-01 is 2004-06-30 23:59:59.997 (datetime rounds to its 3.33 ms ticks, not .998)", args: [], tables: {} }],
  }),
  statusFn("ufnGetDocumentStatusText", "ufn_get_document_status_text", [1, 2, 3, 4], ["Pending approval", "Approved", "Obsolete"]),
  statusFn("ufnGetPurchaseOrderStatusText", "ufn_get_purchase_order_status_text", [1, 2, 3, 4, 5], ["Pending", "Approved", "Rejected", "Complete"]),
  statusFn("ufnGetSalesOrderStatusText", "ufn_get_sales_order_status_text", [1, 2, 3, 4, 5, 6, 7],
    ["In process", "Approved", "Backordered", "Rejected", "Shipped", "Cancelled"]),
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
    fixedCases: [
      { label: "0 is padded to '00000000'", args: [0], tables: {} },
      { label: "5 is padded to '00000005'", args: [5], tables: {} },
      { label: "-5 keeps its sign inside the padding: '000000-5'", args: [-5], tables: {} },
      { label: "12345678 (exactly 8 characters) is unchanged", args: [12345678], tables: {} },
      { label: "99999999 (largest 8-digit value) is unchanged", args: [99999999], tables: {} },
      { label: "100000000 (9 characters) does not fit varchar(8): CONVERT gives '*', padded to '0000000*'", args: [100000000], tables: {} },
      { label: "-9999999 (8 characters with the sign) is unchanged", args: [-9999999], tables: {} },
      { label: "-10000000 (9 characters with the sign) gives '0000000*'", args: [-10000000], tables: {} },
      { label: "2147483647 (int maximum) gives '0000000*'", args: [2147483647], tables: {} },
      { label: "-2147483648 (int minimum) gives '0000000*'", args: [-2147483648], tables: {} },
      { label: "NULL stays NULL (REPLICATE with a NULL length is NULL)", args: [null], tables: {} },
    ],
  }),
];

/**
 * Sales.vSalesPerson trap case (hand-derived). Expected: 3 rows.
 *  - person 1: no territory (LEFT JOIN gives NULL TerritoryName/Group), two phones (one row each; phone type 9 has no
 *    PhoneNumberType row, so PhoneNumberType is NULL), no email, NULL MiddleName and SalesQuota, money at 4 decimal places
 *  - person 2: territory, email, no phone (NULL phone columns), a first name with a trailing space (kept)
 *  - person 3: no address row, so the INNER JOIN to BusinessEntityAddress drops them
 */
function salesPersonCase(): FixedCase {
  const person = (id: number, over: Row = {}): Row => ({
    BusinessEntityID: id, Title: null, FirstName: `First${id}`, MiddleName: null, LastName: `Last${id}`, Suffix: null, EmailPromotion: 0, ...over,
  });
  return {
    label: "no territory, two phones, no email; trailing space kept; a sales person without an address is dropped",
    tables: {
      "Sales.SalesPerson": [
        { BusinessEntityID: 1, TerritoryID: null, SalesQuota: null, SalesYTD: "0.0001", SalesLastYear: "1234567.8912" },
        { BusinessEntityID: 2, TerritoryID: 1, SalesQuota: "300000.0000", SalesYTD: "-5.5000", SalesLastYear: "0.0000" },
        { BusinessEntityID: 3, TerritoryID: 1, SalesQuota: null, SalesYTD: "1.0000", SalesLastYear: "1.0000" },
      ],
      "HumanResources.Employee": [1, 2, 3].map((id) => ({ BusinessEntityID: id, JobTitle: "Sales Representative" })),
      "Person.Person": [person(1), person(2, { Title: "Ms.", FirstName: "Ann ", Suffix: "Jr.", EmailPromotion: 2 }), person(3)],
      "Person.BusinessEntityAddress": [{ BusinessEntityID: 1, AddressID: 1 }, { BusinessEntityID: 2, AddressID: 2 }],
      "Person.Address": [
        { AddressID: 1, AddressLine1: "1 Main St", AddressLine2: null, City: "Bothell", StateProvinceID: 1, PostalCode: "98011" },
        { AddressID: 2, AddressLine1: "2 High St", AddressLine2: "Suite 5", City: "Seattle", StateProvinceID: 1, PostalCode: "98104" },
      ],
      "Person.StateProvince": [{ StateProvinceID: 1, CountryRegionCode: "US", Name: "Washington" }],
      "Person.CountryRegion": [{ CountryRegionCode: "US", Name: "United States" }],
      "Sales.SalesTerritory": [{ TerritoryID: 1, Name: "Northwest", Group: "North America" }],
      "Person.EmailAddress": [{ BusinessEntityID: 2, EmailAddress: "ann@example.com" }],
      "Person.PersonPhone": [
        { BusinessEntityID: 1, PhoneNumber: "555-0100", PhoneNumberTypeID: 1 },
        { BusinessEntityID: 1, PhoneNumber: "555-0199", PhoneNumberTypeID: 9 },
      ],
      "Person.PhoneNumberType": [{ PhoneNumberTypeID: 1, Name: "Cell" }],
    },
  };
}

/**
 * Person.vStateProvinceCountryRegion (hand-derived). The source database's collation is SQL_Latin1_General_CP1_CI_AS, so
 * the join on CountryRegionCode is case-insensitive and ignores trailing spaces; each of those gets its own case.
 */
function stateProvinceCases(): FixedCase[] {
  const sp = (id: number, code: string, country: string, only: number, name: string, territory: number): Row =>
    ({ StateProvinceID: id, StateProvinceCode: code, CountryRegionCode: country, IsOnlyStateProvinceFlag: only, Name: name, TerritoryID: territory });
  return [
    {
      label: "'WA' in char(3) comes back padded; IsOnlyStateProvinceFlag 1 and a trailing space in the name are kept; a province of a country with no CountryRegion row (FR) is dropped; a country with no province (DE) is not listed",
      tables: {
        "Person.CountryRegion": [{ CountryRegionCode: "US", Name: "United States" }, { CountryRegionCode: "CA", Name: "Canada" }, { CountryRegionCode: "DE", Name: "Germany" }],
        "Person.StateProvince": [sp(1, "WA", "US", 0, "Washington", 1), sp(2, "AB", "CA", 1, "Alberta ", 6), sp(3, "75", "FR", 0, "Paris", 7)],
      },
    },
    {
      label: "collation: province code 'us' joins country 'US' (case-insensitive CI_AS); CountryRegionCode comes from the country row ('US')",
      tables: {
        "Person.CountryRegion": [{ CountryRegionCode: "US", Name: "United States" }],
        "Person.StateProvince": [sp(1, "WA", "us", 0, "Washington", 1)],
      },
    },
    {
      label: "trailing space: province code 'CA ' joins country 'CA' (SQL Server equality ignores trailing spaces)",
      tables: {
        "Person.CountryRegion": [{ CountryRegionCode: "CA", Name: "Canada" }],
        "Person.StateProvince": [sp(2, "AB", "CA ", 0, "Alberta", 6)],
      },
    },
  ];
}

/**
 * HumanResources.vEmployeeDepartment (hand-derived). Expected: 3 rows, only open department histories (EndDate IS NULL).
 *  - employee 1: an ended history (excluded), an open one (kept), an open one to a department that does not exist (dropped)
 *  - employee 2: two open histories at the date boundaries 1753-01-01 and 9999-12-31 (two rows); Title '' (not NULL),
 *    MiddleName and Suffix set, JobTitle with a trailing space (kept)
 *  - employee 3: one history that ended the day it started (excluded)
 *  - employee 4: an open history but no Person row (dropped by the inner join)
 *  - department 3 has no history (not listed)
 */
function employeeDepartmentCase(): FixedCase {
  const edh = (id: number, dept: number, start: string, end: string | null): Row => ({ BusinessEntityID: id, DepartmentID: dept, StartDate: start, EndDate: end });
  return {
    label: "only open histories: ended ones excluded, missing department or person dropped, two open histories give two rows; 1753-01-01 and 9999-12-31 start dates; Title '' kept, not NULL",
    tables: {
      "Person.Person": [
        { BusinessEntityID: 1, Title: null, FirstName: "Ann", MiddleName: null, LastName: "Lee", Suffix: null },
        { BusinessEntityID: 2, Title: "", FirstName: "Bo", MiddleName: "J", LastName: "Ng", Suffix: "Jr." },
        { BusinessEntityID: 3, Title: "Mr.", FirstName: "Cy", MiddleName: null, LastName: "Oh", Suffix: null },
      ],
      "HumanResources.Employee": [
        { BusinessEntityID: 1, JobTitle: "Engineer" }, { BusinessEntityID: 2, JobTitle: "Tester " },
        { BusinessEntityID: 3, JobTitle: "Clerk" }, { BusinessEntityID: 4, JobTitle: "Ghost" },
      ],
      "HumanResources.Department": [
        { DepartmentID: 1, Name: "Engineering", GroupName: "Research and Development" },
        { DepartmentID: 2, Name: "Sales", GroupName: "Sales and Marketing" },
        { DepartmentID: 3, Name: "Unused", GroupName: "Executive General and Administration" },
      ],
      "HumanResources.EmployeeDepartmentHistory": [
        edh(1, 2, "2001-01-01", "2005-06-30"), edh(1, 1, "2005-07-01", null), edh(1, 9, "2011-01-01", null),
        edh(2, 1, "1753-01-01", null), edh(2, 2, "9999-12-31", null),
        edh(3, 2, "2010-01-01", "2010-01-01"),
        edh(4, 1, "2002-02-02", null),
      ],
    },
  };
}

/**
 * HumanResources.vEmployeeDepartmentHistory (hand-derived). Expected: 3 rows, ended histories included.
 *  - employee 1: an ended history and an open one (EndDate NULL): two rows
 *  - employee 2: a history with a shift that does not exist (dropped); one from 1753-01-01 to 9999-12-31 (kept); Title ''
 *  - employee 3: a history but no Person row (dropped)
 */
function employeeDepartmentHistoryCase(): FixedCase {
  const edh = (id: number, dept: number, shift: number, start: string, end: string | null): Row =>
    ({ BusinessEntityID: id, DepartmentID: dept, ShiftID: shift, StartDate: start, EndDate: end });
  return {
    label: "ended and open histories both listed (EndDate NULL kept); missing shift or person dropped; 1753-01-01 to 9999-12-31; Title '' kept, not NULL",
    tables: {
      "Person.Person": [
        { BusinessEntityID: 1, Title: null, FirstName: "Ann", MiddleName: null, LastName: "Lee", Suffix: null },
        { BusinessEntityID: 2, Title: "", FirstName: "Bo", MiddleName: "J", LastName: "Ng", Suffix: "Jr." },
      ],
      "HumanResources.Employee": [{ BusinessEntityID: 1 }, { BusinessEntityID: 2 }, { BusinessEntityID: 3 }],
      "HumanResources.Shift": [{ ShiftID: 1, Name: "Day" }, { ShiftID: 2, Name: "Evening" }],
      "HumanResources.Department": [
        { DepartmentID: 1, Name: "Engineering", GroupName: "Research and Development" },
        { DepartmentID: 2, Name: "Sales", GroupName: "Sales and Marketing" },
      ],
      "HumanResources.EmployeeDepartmentHistory": [
        edh(1, 1, 1, "2001-01-01", "2005-06-30"), edh(1, 2, 2, "2005-07-01", null),
        edh(2, 1, 3, "2003-03-03", null), edh(2, 2, 1, "1753-01-01", "9999-12-31"),
        edh(3, 1, 1, "2004-04-04", null),
      ],
    },
  };
}

/**
 * Production.vProductAndDescription (hand-derived). Expected: 6 rows (products 1 and 4 share model 1, which has three
 * described cultures).
 *  - culture codes in char(6) come back padded ('en' -> 'en    '); 'zh-cht' fills all six characters
 *  - one description is '' (empty, kept, not NULL); one has an accent and a trailing space (kept)
 *  - a culture row pointing at a missing description is dropped; a product with no model (NULL) is dropped; a product
 *    whose model has no culture rows is dropped; a model with culture rows but no product is not listed
 */
function productAndDescriptionCase(): FixedCase {
  return {
    label: "two products sharing a model fan out over its three described cultures; char(6) culture codes padded; '' and trailing-space descriptions kept; no model, no cultures or a missing description drops the row",
    tables: {
      "Production.Product": [
        { ProductID: 1, Name: "Bike", ProductModelID: 1 }, { ProductID: 2, Name: "Helmet", ProductModelID: null },
        { ProductID: 3, Name: "Chain", ProductModelID: 2 }, { ProductID: 4, Name: "Bike Frame", ProductModelID: 1 },
      ],
      "Production.ProductModel": [{ ProductModelID: 1, Name: "Road-150" }, { ProductModelID: 2, Name: "Chain" }, { ProductModelID: 3, Name: "Orphan" }],
      "Production.ProductDescription": [
        { ProductDescriptionID: 10, Description: "Light, stiff frame" },
        { ProductDescriptionID: 11, Description: "" },
        { ProductDescriptionID: 12, Description: "Cadre léger " },
        { ProductDescriptionID: 13, Description: "Orphan model text" },
      ],
      "Production.ProductModelProductDescriptionCulture": [
        { ProductModelID: 1, ProductDescriptionID: 10, CultureID: "en" },
        { ProductModelID: 1, ProductDescriptionID: 12, CultureID: "fr" },
        { ProductModelID: 1, ProductDescriptionID: 11, CultureID: "zh-cht" },
        { ProductModelID: 1, ProductDescriptionID: 99, CultureID: "de" },
        { ProductModelID: 3, ProductDescriptionID: 13, CultureID: "ar" },
      ],
    },
  };
}
