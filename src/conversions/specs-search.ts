/**
 * Website.Search* (WideWorldImporters): text search returning a FOR JSON document.
 *
 * Harness choices, all recorded in the pair record notes:
 *  - The procedure's single JSON column is collected on SQL Server with INSERT ... EXEC (FOR JSON splits long
 *    documents over several rows) and concatenated in order; PostgreSQL returns one text value. Both are compared as
 *    parsed JSON (spec.jsonColumns): whitespace is ignored, key order, array order and values are not.
 *  - Sort keys are made distinct (ColSpec.distinct): the source does not define the order of rows that tie on the
 *    sort key, and rows inside a JSON document cannot be compared as a multiset.
 *  - The search text and the searched columns draw from shared vocabularies so searches hit, including LIKE
 *    metacharacters (% _ [ ] ^ -) and case differences.
 *  - @MaximumRowsToReturn is generated as 0..5. A negative or NULL value is an error on SQL Server (TOP) and not on
 *    PostgreSQL (LIMIT NULL = no limit); the harness does not compare errors, so that input is outside the property.
 */

import type { ColSpec, FixedCase, Mutant, ObjectSpec, Row, TableSpec } from "../harness/generic/spec.js";

const int = { kind: "int" } as const;
const bit = { kind: "bit" } as const;
const nv = (n: number) => ({ kind: "nvarchar", n }) as const;
const pk = (name: string): ColSpec => ({ name, type: int, role: "pk" });
const ref = (name: string): ColSpec => ({ name, type: int, role: "ref" });
const seq = (name: string, offset: number): ColSpec => ({ name, type: int, role: "seq", offset });
const col = (name: string, type: ColSpec["type"], extra: Partial<ColSpec> = {}): ColSpec => ({ name, type, nullable: false, ...extra });

/** Values the searched columns hold. Deliberately includes LIKE metacharacters, case variants and accents. */
export const TEXT: string[] = [
  "Amy Trefl", "amy", "AMY smith", "Tailspin Toys", "Toys R Us", "Café Noir", "CAFÉ", "Ab", "a_b", "100% Off", "[a]", "x[y",
  "a-b", "Zed", "z", "", " ", "a", "A", "b", "B", "c", "^", "]", "50%", "_", "a\\b", "line1\nline2", "tab\tx",
];
/** Search terms (the procedure wraps them in %...%). */
export const TERMS: string[] = [
  "", " ", "a", "A", "b", "z", "amy", "AMY", "toys", "Toy", "café", "CAFÉ", "caf", "é", "%", "_", "a_", "_b", "a%", "[a]", "[a", "[^a]",
  "[a-c]", "[c-a]", "[]", "[^]", "[", "]", "^", "-", "a-b", "\\", "100%", "x[y", "[x]", "e",
];

const maxRows: ColSpec = { name: "MaximumRowsToReturn", type: int, range: [0, 5], special: [0, 1, 2, 3, 4, 5] };
const searchText: ColSpec = { name: "SearchText", type: nv(1000), strings: TERMS };

// SQL Server does not allow INSERT ... EXEC on a procedure that uses FOR JSON, so the procedure is called directly and
// the harness joins the chunks it streams back (forJsonChunks), as any client has to.
const callSs = (proc: string): string => `EXEC ${proc} @SearchText = ?, @MaximumRowsToReturn = ?`;
const benchSs = (proc: string): string => `EXEC ${proc} @SearchText = N'a', @MaximumRowsToReturn = 100`;

/** Planted defects that apply to every Search* conversion (each text occurs in all five final files). */
const COMMON_MUTANTS: Mutant[] = [
  { name: "match is case-sensitive", from: "~* tsql_compat.like_to_regex", to: "~ tsql_compat.like_to_regex" },
  { name: "'[..]' treated as literal characters", from: "ELSIF c = '[' THEN", to: "ELSIF c = '~' THEN" },
  { name: "'_' matches a letter only", from: "result || '.';", to: "result || '[a-z]';" },
  { name: "one row too many returned", from: "LIMIT maximum_rows_to_return", to: "LIMIT maximum_rows_to_return + 1" },
];
const SORT_KEY = "ORDER BY r.sort_key COLLATE tsql_compat.latin1_general_100_ci_as)";
const DESCENDING: Mutant = { name: "results in descending order", from: SORT_KEY, to: SORT_KEY.replace(")", " DESC)") };

const base = {
  database: "WideWorldImporters", objectClass: "procedure" as const, windowParams: false, orderKey: [] as string[],
  params: [searchText, maxRows] as ColSpec[], jsonColumns: ["result"], forJsonChunks: true,
  pgCall: "SELECT {fn}($1::text, $2::integer) AS result",
  benchPg: "SELECT {fn}('a', 100) AS result",
};

const people: TableSpec = {
  schema: "Application", name: "People",
  columns: [pk("PersonID"), col("FullName", nv(50), { strings: TEXT, distinct: true }), col("PreferredName", nv(50), { strings: TEXT })],
};
const cities: TableSpec = { schema: "Application", name: "Cities", columns: [pk("CityID"), col("CityName", nv(50), { strings: TEXT })] };

const phone = (n: string): ColSpec => col(n, nv(20), { strings: ["(201) 555-0100", "", " ", "x"] });

/**
 * Hand-derived LIKE cases: [search term, searched values]. They always run before the random samples, so the
 * semantics that the random terms only hit occasionally are checked on every run.
 */
const LIKE_CASES: Array<[string, string[]]> = [
  ["a_", ["a_b", "xay", "a", "A-"]],              // '_' is exactly one character of any kind (not letters only); case-insensitive
  ["[a-c]", ["B", "d", "  ", "aaa", "x[a-c]"]],    // a range class, case-insensitive; the brackets are not literal
  ["_", ["", " ", "x"]],                           // '_' needs one character
  ["café", ["CAFÉ x", "cafe", "un café"]],         // case-insensitive, accent-sensitive
  ["[^a]", ["a", "A", "b", ""]],                   // negated class
  ["a\\b", ["a\\b", "ab"]],                        // backslash is an ordinary character (T-SQL LIKE has no default escape)
];
const pad4 = (n: number): string => String(n).padStart(4, "0");
const likeCases = (label: string, build: (values: string[]) => Record<string, Row[]>): FixedCase[] =>
  LIKE_CASES.map(([term, values]) => ({ label: `${label}: LIKE ${JSON.stringify(term)}`, args: [term, 5], tables: build(values) }));

const stockCases = (column: string): FixedCase[] =>
  likeCases(column, (values) => ({
    "Warehouse.StockItems": values.map((v, i) => ({ StockItemID: i + 1, StockItemName: `Item${pad4(i + 1)}`, [column]: v })),
  }));
// The contact's names contain none of the characters the terms look for, so a hit can only come from the searched name.
const contactTables = (): Record<string, Row[]> => ({
  "Application.Cities": [{ CityID: 1, CityName: "Town" }],
  "Application.People": [{ PersonID: 1, FullName: "Mo Lo0001", PreferredName: "Mo" }],
});
const customerCases = (): FixedCase[] =>
  likeCases("name", (values) => ({
    ...contactTables(),
    "Sales.Customers": values.map((v, i) => ({
      CustomerID: i + 1, CustomerName: `${v}${pad4(i + 1)}`, DeliveryCityID: 1, PhoneNumber: "(201) 555-0100", FaxNumber: "", PrimaryContactPersonID: 1,
    })),
  }));
const supplierCases = (): FixedCase[] =>
  likeCases("name", (values) => ({
    ...contactTables(),
    "Purchasing.Suppliers": values.map((v, i) => ({
      SupplierID: i + 1, SupplierName: `${v}${pad4(i + 1)}`, DeliveryCityID: 1, PhoneNumber: "(201) 555-0100", FaxNumber: "", PrimaryContactPersonID: 1,
    })),
  }));
const peopleCases = (): FixedCase[] =>
  likeCases("search name", (values) => ({
    "Application.People": values.map((v, i) => ({
      PersonID: i + 1, FullName: `Q${pad4(i + 1)}`, PreferredName: "Q", IsSalesperson: false, IsEmployee: i % 2 === 0, SearchName: v,
    })),
    "Sales.Customers": [],
    "Purchasing.Suppliers": [],
  }));

/** Why the runtime step is missed by the two search procedures that match across the contact's names (measured, not guessed). */
const RUNTIME_NOTE_CONTACT = [
  "Step 4 is missed on the 5,000-row synthetic volume (PostgreSQL about 40 ms, SQL Server about 7 ms). Profiled on a 5,000-row copy: the case-insensitive regular expression over the concatenated name and contact names takes about 6 ms of the join, the planner then expects almost no rows and probes the cities table about 5,000 times (about 8 ms), and the ICU sort of the matching rows takes the rest. Building the JSON only for the returned rows (applied) and disabling nested loops (no gain) were tried; replacing the regular expression with ILIKE was measured at about a third faster but cannot express T-SQL '[..]' classes. Results are equivalent (step 3 passes); this is a performance finding, not a correctness one.",
];
const NOTES = [
  "WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted (where the source declares it).",
  "LIKE is translated by tsql_compat.like_to_regex into a case-insensitive regular expression: PostgreSQL LIKE has no [..] classes and treats backslash as an escape, SQL Server LIKE has no escape character. Patterns that the harness generates are checked; collation-specific equivalences outside them (for example ß = ss) are not claimed.",
  "ORDER BY uses a tailored ICU collation (tsql_compat.latin1_general_100_ci_as: level 2, case-insensitive and accent-sensitive, ASCII punctuation order measured on SQL Server) plus removal of hyphens and apostrophes (Windows word sort), to follow the source's Latin1_General_100_CI_AS ordering. Verified for ASCII text; sort keys are generated distinct, so the order of ties is not claimed.",
  "The JSON documents are compared as parsed values (key order, array order, nulls and strings are compared; whitespace is not).",
  "@MaximumRowsToReturn is generated as 0..5; negative or NULL values (an error on SQL Server, not on PostgreSQL) are outside the property.",
];

export const SEARCH_SPECS: ObjectSpec[] = [
  {
    ...base, schema: "Website", name: "SearchForStockItems",
    pgFunction: "website.search_for_stock_items",
    fixedCases: stockCases("SearchDetails"),
    ssCall: callSs("Website.SearchForStockItems"), benchSs: benchSs("Website.SearchForStockItems"),
    tables: [{
      schema: "Warehouse", name: "StockItems",
      columns: [pk("StockItemID"), col("StockItemName", nv(100), { strings: TEXT, distinct: true }), col("SearchDetails", nv(100), { strings: TEXT })],
    }],
    mutants: [...COMMON_MUTANTS, DESCENDING],
    notes: NOTES,
  },
  {
    ...base, schema: "Website", name: "SearchForStockItemsByTags",
    pgFunction: "website.search_for_stock_items_by_tags",
    fixedCases: stockCases("Tags"),
    ssCall: callSs("Website.SearchForStockItemsByTags"), benchSs: benchSs("Website.SearchForStockItemsByTags"),
    tables: [{
      schema: "Warehouse", name: "StockItems",
      columns: [pk("StockItemID"), col("StockItemName", nv(100), { strings: TEXT, distinct: true }), col("Tags", nv(100), { strings: TEXT, nullable: true })],
    }],
    mutants: [
      ...COMMON_MUTANTS,
      DESCENDING,
      { name: "searches the item name instead of the tags", from: 'si."Tags" ~*', to: 'si."StockItemName" ~*' },
    ],
    notes: [...NOTES, "Tags is nullable in the source; a NULL Tags value never matches."],
  },
  {
    ...base, schema: "Website", name: "SearchForCustomers",
    pgFunction: "website.search_for_customers",
    fixedCases: customerCases(),
    ssCall: callSs("Website.SearchForCustomers"), benchSs: benchSs("Website.SearchForCustomers"),
    tables: [
      {
        schema: "Sales", name: "Customers",
        columns: [
          pk("CustomerID"), col("CustomerName", nv(100), { strings: TEXT, distinct: true }), ref("DeliveryCityID"),
          phone("PhoneNumber"), phone("FaxNumber"), ref("PrimaryContactPersonID"),
        ],
      },
      cities, people,
    ],
    mutants: [
      ...COMMON_MUTANTS,
      DESCENDING,
      { name: "contact LEFT JOIN becomes INNER JOIN", from: "LEFT OUTER JOIN application.people", to: "INNER JOIN application.people" },
      {
        name: "|| instead of concat (NULL contact hides the customer)",
        from: `concat(c."CustomerName", ' ', p."FullName", ' ', p."PreferredName")`,
        to: `(c."CustomerName" || ' ' || p."FullName" || ' ' || p."PreferredName")`,
      },
    ],
    notes: [...NOTES, ...RUNTIME_NOTE_CONTACT],
  },
  {
    ...base, schema: "Website", name: "SearchForSuppliers",
    pgFunction: "website.search_for_suppliers",
    fixedCases: supplierCases(),
    ssCall: callSs("Website.SearchForSuppliers"), benchSs: benchSs("Website.SearchForSuppliers"),
    tables: [
      {
        schema: "Purchasing", name: "Suppliers",
        columns: [
          pk("SupplierID"), col("SupplierName", nv(100), { strings: TEXT, distinct: true }), ref("DeliveryCityID"),
          phone("PhoneNumber"), phone("FaxNumber"), ref("PrimaryContactPersonID"),
        ],
      },
      cities, people,
    ],
    mutants: [
      ...COMMON_MUTANTS,
      DESCENDING,
      { name: "contact LEFT JOIN becomes INNER JOIN", from: "LEFT OUTER JOIN application.people", to: "INNER JOIN application.people" },
      {
        name: "|| instead of concat (NULL contact hides the supplier)",
        from: `concat(s."SupplierName", ' ', p."FullName", ' ', p."PreferredName")`,
        to: `(s."SupplierName" || ' ' || p."FullName" || ' ' || p."PreferredName")`,
      },
    ],
    notes: [...NOTES, ...RUNTIME_NOTE_CONTACT],
  },
  {
    ...base, schema: "Website", name: "SearchForPeople",
    pgFunction: "website.search_for_people",
    fixedCases: peopleCases(),
    ssCall: callSs("Website.SearchForPeople"), benchSs: benchSs("Website.SearchForPeople"),
    tables: [
      {
        schema: "Application", name: "People",
        columns: [
          pk("PersonID"), col("FullName", nv(50), { strings: TEXT, distinct: true }), col("PreferredName", nv(50), { strings: TEXT }),
          col("IsSalesperson", bit), col("IsEmployee", bit), col("SearchName", nv(101), { strings: TEXT }),
        ],
      },
      // A person is the contact of at most one customer and at most one supplier in each role (seq = unique), so the three
      // LEFT JOINs cannot fan a person out into several rows whose relative order the source leaves undefined.
      {
        schema: "Sales", name: "Customers",
        columns: [pk("CustomerID"), col("CustomerName", nv(100), { strings: TEXT }), seq("PrimaryContactPersonID", 0)],
      },
      {
        schema: "Purchasing", name: "Suppliers",
        columns: [
          pk("SupplierID"), col("SupplierName", nv(100), { strings: TEXT }), seq("PrimaryContactPersonID", 1), seq("AlternateContactPersonID", 2),
        ],
      },
    ],
    mutants: [
      ...COMMON_MUTANTS,
      DESCENDING,
      {
        name: "employee tested before salesperson",
        from: `CASE WHEN p."IsSalesperson" THEN 'Salesperson'\n                    WHEN p."IsEmployee" THEN 'Employee'`,
        to: `CASE WHEN p."IsEmployee" THEN 'Employee'\n                    WHEN p."IsSalesperson" THEN 'Salesperson'`,
      },
      { name: "company defaults to empty instead of 'WWI'", from: `sa."SupplierName", 'WWI')`, to: `sa."SupplierName", '')` },
    ],
    notes: [...NOTES, "Fan-out of a person into several rows (a person who is the contact of several customers) is not generated: the source leaves the order of those rows undefined."],
  },
];
