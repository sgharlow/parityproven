/**
 * AdventureWorks2025, second batch (2026-11-12): two views over Person with an xml column, a multi-statement table-valued
 * function, and the two bill-of-materials procedures (recursive CTEs with OPTION (MAXRECURSION 25)).
 * Tables come from catalog/ (SQL Server's own metadata).
 */

import type { ColSpec, FixedCase, ObjectSpec, Row } from "../harness/generic/spec.js";
import { specFromCatalog, type CatalogOptions } from "./catalog.js";

const DB = "AdventureWorks2025";
const ref = (name: string, nullable = false): ColSpec => ({ name, type: { kind: "int" }, role: "ref", nullable });
const dtm = (name: string): ColSpec => ({ name, type: { kind: "datetime" } });

const view = (qualified: string, pgName: string, notes: string[] = [], opts: CatalogOptions = {}): ObjectSpec =>
  specFromCatalog(DB, qualified, { orderKey: [], mutants: [], pgFunction: pgName, notes }, opts);

const XML_NOTE = "The xml column is passed through unchanged. In the source it is typed by an XML schema collection; the scratch column is untyped xml, and the generated documents are in SQL Server's serialised form.";

// ---- bill of materials --------------------------------------------------------------------------------------------

const MAXRECURSION = { label: "maximum recursion (25) exhausted", sqlServer: [530], postgres: ["54001"] };

/** Real bills of materials are acyclic: a product is not its own component. Random data keeps component > assembly. */
function acyclic(d: { tables: Record<string, Row[]> }): void {
  for (const r of d.tables["Production.BillOfMaterials"] ?? []) {
    const a = r.ProductAssemblyID as number | null;
    const c = r.ComponentID as number;
    if (a !== null && c <= a) { r.ProductAssemblyID = c; r.ComponentID = a + 1; }
    if (r.ProductAssemblyID === r.ComponentID) r.ComponentID = (r.ComponentID as number) + 1;
  }
}

function bomFixedCases(direction: "down" | "up"): FixedCase[] {
  const at = "2020-01-02T12:00:00.000";
  const edge = (assembly: number | null, component: number, extra: Partial<Row> = {}): Row => ({
    ProductAssemblyID: assembly, ComponentID: component, StartDate: "2020-01-01T00:00:00.000", EndDate: null, BOMLevel: 1, PerAssemblyQty: "1.00", ...extra,
  });
  const products = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ ProductID: i + 1, Name: `P${i + 1}`, StandardCost: "1.5000", ListPrice: "2.2500" }));
  // a chain 1 -> 2 -> ... -> n+1 has n edges; walking it from one end recurses n - 1 times
  const chain = (n: number): Row[] => Array.from({ length: n }, (_, i) => edge(i + 1, i + 2, { BOMLevel: i + 1 }));
  const start = direction === "down" ? 1 : undefined;
  const from = (n: number) => (direction === "down" ? 1 : n + 1);
  return [
    { label: "a cycle (1 -> 2 -> 1): both engines stop at MAXRECURSION 25", args: [1, at], tables: { "Production.BillOfMaterials": [edge(1, 2), edge(2, 1)], "Production.Product": products(2) } },
    { label: "a chain needing exactly 25 recursions is allowed", args: [from(26), at], tables: { "Production.BillOfMaterials": chain(26), "Production.Product": products(27) } },
    { label: "a chain needing 26 recursions fails", args: [from(27), at], tables: { "Production.BillOfMaterials": chain(27), "Production.Product": products(28) } },
    {
      label: "the same component twice under one assembly: quantities are summed",
      args: [start ?? 3, at],
      tables: { "Production.BillOfMaterials": [edge(1, 3, { PerAssemblyQty: "2.00" }), edge(1, 3, { PerAssemblyQty: "1.50" }), edge(1, 2)], "Production.Product": products(3) },
    },
    {
      label: "check date on the end date is included; after it is excluded",
      args: [start ?? 2, "2020-01-03T00:00:00.000"],
      tables: { "Production.BillOfMaterials": [edge(1, 2, { EndDate: "2020-01-03T00:00:00.000" }), edge(1, 3, { EndDate: "2020-01-02T23:59:59.997" })], "Production.Product": products(3) },
    },
  ];
}

function bom(name: "uspGetBillOfMaterials" | "uspGetWhereUsedProductID", pgName: string, direction: "down" | "up"): ObjectSpec {
  return specFromCatalog(DB, `dbo.${name}`, {
    orderKey: ["BOMLevel", "ProductAssemblyID", "ComponentID"],
    pgFunction: `dbo.${pgName}`,
    params: [ref("StartProductID"), dtm("CheckDate")],
    ssCall: `EXEC dbo.${name} @StartProductID = ?, @CheckDate = ?`,
    pgCall: "SELECT * FROM {fn}($1::integer, $2::timestamp)",
    resultErrorClasses: [MAXRECURSION],
    prepare: (d) => {
      acyclic(d);
      // start from a product that appears in the data (as an assembly when walking down, a component when walking up),
      // except when the generated start is the dangling key, which stays the "no rows" case
      const first = d.tables["Production.BillOfMaterials"]?.[0];
      const start = d.args?.[0];
      if (first && typeof start === "number" && start <= 3) {
        const pick = direction === "down" ? first.ProductAssemblyID : first.ComponentID;
        if (pick !== null && pick !== undefined) d.args![0] = pick;
      }
      // every product in the key universe (1..3) that the bill references exists (dangling keys stay missing)
      const products = d.tables["Production.Product"];
      if (products && d.args?.length) {
        const ids = new Set(products.map((p) => p.ProductID));
        for (const r of d.tables["Production.BillOfMaterials"] ?? []) {
          for (const id of [r.ProductAssemblyID, r.ComponentID]) {
            if (typeof id === "number" && id <= 3 && !ids.has(id)) {
              products.push({ ProductID: id, Name: `P${id}`, StandardCost: "1.0000", ListPrice: "2.0000" });
              ids.add(id);
            }
          }
        }
      }
    },
    fixedCases: bomFixedCases(direction),
    // ids 1..25 with component > assembly: no path can exceed 24 recursions, so the volume run never hits MAXRECURSION
    benchVolume: 25,
    benchSs: `EXEC dbo.${name} @StartProductID = 1, @CheckDate = '2020-01-02T12:00:00'`,
    benchPg: `SELECT * FROM {fn}(1, TIMESTAMP '2020-01-02 12:00:00')`,
    mutants: [
      { name: "no recursion limit check (rows returned up to the depth guard)", from: "WHERE r.recursion_level > 25)", to: "WHERE false)" },
      { name: "limit one level too low", from: "WHERE r.recursion_level > 25)", to: "WHERE r.recursion_level > 24)" },
      { name: "open-ended components excluded (ISNULL(EndDate, @CheckDate) dropped)", from: "check_date <= COALESCE(b.\"EndDate\", check_date)\n", to: "check_date <= b.\"EndDate\"\n" },
      { name: "quantities not summed", from: "SUM(r.per_assembly_qty)", to: "MAX(r.per_assembly_qty)" },
    ],
    notes: [
      "The procedure becomes a set-returning function (SELECT * FROM ...).",
      "OPTION (MAXRECURSION 25): SQL Server stops with error 530 when the recursive CTE would produce a row at recursion level 26. PostgreSQL has no such option, and a cycle would recurse forever. The conversion bounds the recursion at level 26 and raises (SQLSTATE 54001) if that level is reached, before returning anything. Both outcomes are compared: the same error, or the same rows.",
      "Random data is acyclic (component > assembly), as real bills of materials are; cycles and the 25/26 boundary are covered by fixed cases.",
      "Step 4 runs on 25 rows per table (larger acyclic volumes would exceed the recursion limit), so the timing is indicative only.",
    ],
  });
}

// ---- multi-statement table-valued function ------------------------------------------------------------------------

const contactInformation: ObjectSpec = specFromCatalog(DB, "dbo.ufnGetContactInformation", {
  orderKey: [],
  mutants: [
    // targets the RETURN QUERY (the IF EXISTS guard before it has the same text and is redundant on its own)
    { name: "consumer rows include store customers", from: "WHERE p.\"BusinessEntityID\" = person_id AND c.\"StoreID\" IS NULL;", to: "WHERE p.\"BusinessEntityID\" = person_id;" },
    { name: "vendor contacts labelled as store contacts", from: "'Vendor Contact'", to: "'Store Contact'" },
    { name: "employee rows without the person join (JobTitle from the wrong row)", from: "SELECT person_id, p.\"FirstName\", p.\"LastName\", e.\"JobTitle\", 'Employee'::varchar(50)", to: "SELECT person_id, p.\"FirstName\", p.\"LastName\", p.\"LastName\", 'Employee'::varchar(50)" },
    // Not planted: dropping the IF person_id IS NOT NULL guard is unobservable, because every query filters on
    // = person_id, which is never true for NULL (an equivalent mutant).
  ],
  pgFunction: "dbo.ufn_get_contact_information",
  params: [ref("PersonID", true)],
  ssCall: "SELECT * FROM dbo.ufnGetContactInformation(?)",
  pgCall: "SELECT * FROM {fn}($1::integer)",
  benchVolume: 2000,
  benchSs: "SELECT COUNT_BIG(*) AS total FROM (SELECT TOP (2000) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_columns AS a CROSS JOIN sys.all_columns AS b) AS v CROSS APPLY dbo.ufnGetContactInformation(CAST(v.n AS int)) AS c",
  benchPg: "SELECT count(*) AS total FROM generate_series(1, 2000) AS n CROSS JOIN LATERAL {fn}(n) AS c",
  notes: [
    "Multi-statement table-valued function: the table variable it fills becomes RETURN QUERY steps in a PL/pgSQL set-returning function. The rows a person gets (one per role) are compared as a multiset; the source does not define their order.",
  ],
});

export const AW2_SPECS: ObjectSpec[] = [
  view("HumanResources.vEmployee", "humanresources.v_employee", [XML_NOTE]),
  // the view keeps only customers without a store (StoreID IS NULL), so that must be the common case
  view("Sales.vIndividualCustomer", "sales.v_individual_customer", [XML_NOTE],   // ten joined tables: none is generated empty, or most samples would join to nothing (empty joins are covered elsewhere)
  { rows: [1, 4], columns: { "Sales.Customer.StoreID": { nullFraction: 0.8 }, "Sales.Customer.PersonID": { nullFraction: 0.05 } } }),
  contactInformation,
  bom("uspGetBillOfMaterials", "usp_get_bill_of_materials", "down"),
  bom("uspGetWhereUsedProductID", "usp_get_where_used_product_id", "up"),
];
