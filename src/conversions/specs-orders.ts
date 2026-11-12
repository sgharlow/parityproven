/**
 * Website.InsertCustomerOrders (WideWorldImporters): takes two table-valued parameters (orders and their lines), allocates
 * order IDs from Sequences.OrderID, and inserts Sales.Orders and Sales.OrderLines in a transaction. Line prices come from
 * Website.CalculateCustomerPrice (a dependency, deployed on both engines from its own verified conversion).
 *
 * Step 3, state form. What is compared, and why:
 *  - The outcome: completed, or which error class was raised (NOT NULL violation, string truncation, numeric overflow).
 *  - Every order's columns, and every line together with its order's purchase-order number and customer (so each line
 *    must belong to the right order). Order IDs themselves are compared as a set (count, distinct, first, last): the
 *    source assigns NEXT VALUE FOR to the rows of @Orders in an undefined order, so which order gets which ID is not claimed.
 *  - The sequence's next value (IDs are consumed even when the insert fails).
 *  - SYSDATETIME() columns are compared as "the call's date / time": each engine checks its own values against its own
 *    clock (OrderDate = today; LastEditedWhen within the last 5 minutes). The exact timestamp is not claimed.
 */

import type { ColSpec, FixedCase, ObjectSpec, Row, TableSpec } from "../harness/generic/spec.js";
import { pgNow, pgToday, ssNow, ssToday } from "./observe.js";

const int = { kind: "int" } as const;
const bit = { kind: "bit" } as const;
const date = { kind: "date" } as const;
const dt2 = { kind: "datetime2" } as const;
const nv = (n: number) => ({ kind: "nvarchar", n }) as const;
const dec = (p: number, s: number) => ({ kind: "decimal", p, s }) as const;
const pk = (name: string): ColSpec => ({ name, type: int, role: "pk" });
const ref = (name: string, nullable = false): ColSpec => ({ name, type: int, role: "ref", nullable });
const col = (name: string, type: ColSpec["type"], extra: Partial<ColSpec> = {}): ColSpec => ({ name, type, nullable: false, ...extra });

const ORDER_SEQUENCE_START = 73596;   // Sequences.OrderID START WITH in the source database
const RARE = 0.01;

/** Tables Website.CalculateCustomerPrice reads (same columns as its own spec). */
export const PRICE_TABLES: TableSpec[] = [
  { schema: "Sales", name: "Customers", columns: [pk("CustomerID"), ref("BuyingGroupID", true), ref("CustomerCategoryID")] },
  {
    schema: "Sales", name: "SpecialDeals", columns: [
      pk("SpecialDealID"), ref("StockItemID", true), ref("CustomerID", true), ref("BuyingGroupID", true),
      ref("CustomerCategoryID", true), ref("StockGroupID", true), col("StartDate", date), col("EndDate", date),
      col("DiscountAmount", dec(18, 2), { nullable: true }), col("DiscountPercentage", dec(18, 3), { nullable: true }), col("UnitPrice", dec(18, 2), { nullable: true }),
    ],
  },
  { schema: "Warehouse", name: "StockItemStockGroups", columns: [pk("StockItemStockGroupID"), ref("StockItemID"), ref("StockGroupID")] },
];

/** Generated deal dates sit around 2020-01-02; move them so that the call's date (today, UTC) sits where 2020-01-02 did. */
export function shiftDealsToToday(tables: Record<string, Row[]>): void {
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const delta = today - Date.UTC(2020, 0, 2);
  const shift = (d: unknown): unknown => (typeof d === "string" ? new Date(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) + delta).toISOString().slice(0, 10) : d);
  for (const r of tables["Sales.SpecialDeals"] ?? []) { r.StartDate = shift(r.StartDate); r.EndDate = shift(r.EndDate); }
}

/** Today's date (UTC) plus n days, as yyyy-mm-dd. The containers' clocks are UTC. */
export const dayFromToday = (n: number): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + n)).toISOString().slice(0, 10);
};

export const ORDER_SPECS: ObjectSpec[] = [
  {
    database: "WideWorldImporters", schema: "Website", name: "InsertCustomerOrders", objectClass: "procedure",
    windowParams: false, orderKey: [],
    pgFunction: "website.insert_customer_orders",
    dependencies: ["Website.CalculateCustomerPrice"],
    params: [
      { name: "OrdersCreatedByPersonID", type: int, range: [1, 20], special: [1, 2, 3] },
      { name: "SalespersonPersonID", type: int, range: [1, 20], special: [2, 7, 16] },
    ],
    ssCall: "EXEC Website.InsertCustomerOrders @Orders = ?, @OrderLines = ?, @OrdersCreatedByPersonID = ?, @SalespersonPersonID = ?",
    pgCall: "CALL {fn}(website.order_list_from_json($1::jsonb), website.order_line_list_from_json($2::jsonb), $3::integer, $4::integer)",
    setup: {
      sqlServer: ["CREATE SCHEMA Sequences", `CREATE SEQUENCE Sequences.OrderID AS int START WITH ${ORDER_SEQUENCE_START} MINVALUE -2147483648`],
      postgres: ["CREATE SCHEMA IF NOT EXISTS sequences", `DROP SEQUENCE IF EXISTS sequences."OrderID"`, `CREATE SEQUENCE sequences."OrderID" AS integer START WITH ${ORDER_SEQUENCE_START} MINVALUE -2147483648`],
    },
    sampleSetup: () => ({
      sqlServer: [`ALTER SEQUENCE Sequences.OrderID RESTART WITH ${ORDER_SEQUENCE_START}`],
      postgres: [`ALTER SEQUENCE sequences."OrderID" RESTART WITH ${ORDER_SEQUENCE_START}`],
    }),
    tables: [
      {
        // Website.OrderList (memory-optimized in the source; disk-based here, the procedure is interpreted T-SQL)
        schema: "Website", name: "OrderList", tvp: { argIndex: 0 },
        // nullable as in the source type; NULLs are rare in random samples (each one fails the call) and covered by fixed cases
        columns: [
          pk("OrderReference"),
          { ...ref("CustomerID", true), nullFraction: RARE },
          col("ContactPersonID", int, { range: [1, 20], nullable: true, nullFraction: RARE }),
          col("ExpectedDeliveryDate", date, { nullable: true, nullFraction: RARE }),
          col("CustomerPurchaseOrderNumber", nv(20), { nullable: true, distinct: true }),
          col("IsUndersupplyBackordered", bit, { nullable: true, nullFraction: RARE }),
          col("Comments", nv(400), { nullable: true }),
          col("DeliveryInstructions", nv(400), { nullable: true }),
        ],
      },
      {
        schema: "Website", name: "OrderLineList", tvp: { argIndex: 1 },
        columns: [
          { ...ref("OrderReference", true), nullFraction: RARE }, { ...ref("StockItemID", true), nullFraction: RARE },
          col("Description", nv(100), { nullable: true, nullFraction: RARE }), col("Quantity", int, { range: [-5, 100], nullable: true, nullFraction: RARE }),
        ],
      },
      {
        schema: "Sales", name: "Orders", rows: [0, 0],
        columns: [
          pk("OrderID"), col("CustomerID", int), col("SalespersonPersonID", int), col("PickedByPersonID", int, { nullable: true }),
          col("ContactPersonID", int), col("BackorderOrderID", int, { nullable: true }), col("OrderDate", date), col("ExpectedDeliveryDate", date),
          col("CustomerPurchaseOrderNumber", nv(20), { nullable: true }), col("IsUndersupplyBackordered", bit), col("Comments", nv(400), { nullable: true }),
          col("DeliveryInstructions", nv(400), { nullable: true }), col("InternalComments", nv(400), { nullable: true }),
          col("PickingCompletedWhen", dt2, { nullable: true }), col("LastEditedBy", int), col("LastEditedWhen", dt2),
        ],
      },
      {
        // OrderLineID (a sequence default in the source) is not referenced by the procedure, so it is not modelled
        schema: "Sales", name: "OrderLines", rows: [0, 0],
        columns: [
          col("OrderID", int), col("StockItemID", int), col("Description", nv(100)), col("PackageTypeID", int), col("Quantity", int),
          col("UnitPrice", dec(18, 2), { nullable: true }), col("TaxRate", dec(18, 3)), col("PickedQuantity", int),
          col("PickingCompletedWhen", dt2, { nullable: true }), col("LastEditedBy", int), col("LastEditedWhen", dt2),
        ],
      },
      { schema: "Warehouse", name: "StockItems", columns: [pk("StockItemID"), col("UnitPackageID", int, { range: [1, 9] }), col("TaxRate", dec(18, 3)), col("UnitPrice", dec(18, 2))] },
      ...PRICE_TABLES,
    ],
    prepare: (d) => shiftDealsToToday(d.tables),
    stateCheck: {
      tables: [],
      sqlServerErrors: [],
      postgresErrors: [],
      errorClasses: [
        { label: "NULL into a NOT NULL column", sqlServer: [515], postgres: ["23502"] },
        { label: "string truncation", sqlServer: [8152, 2628], postgres: ["22001"] },
        { label: "numeric overflow", sqlServer: [8115], postgres: ["22003"] },
      ],
      queries: [
        {
          label: "orders",
          sqlServer: `SELECT o.CustomerID, o.SalespersonPersonID, o.PickedByPersonID, o.ContactPersonID, o.BackorderOrderID, ${ssToday("o.OrderDate", "OrderDate")},
                        o.ExpectedDeliveryDate, o.CustomerPurchaseOrderNumber, o.IsUndersupplyBackordered, o.Comments, o.DeliveryInstructions, o.InternalComments,
                        o.PickingCompletedWhen, o.LastEditedBy, ${ssNow("o.LastEditedWhen", "LastEditedWhen")}
                      FROM Sales.Orders AS o`,
          postgres: `SELECT o."CustomerID", o."SalespersonPersonID", o."PickedByPersonID", o."ContactPersonID", o."BackorderOrderID", ${pgToday('o."OrderDate"', "OrderDate")},
                       o."ExpectedDeliveryDate", o."CustomerPurchaseOrderNumber", o."IsUndersupplyBackordered", o."Comments", o."DeliveryInstructions", o."InternalComments",
                       o."PickingCompletedWhen", o."LastEditedBy", ${pgNow('o."LastEditedWhen"', "LastEditedWhen")}
                     FROM sales.orders AS o`,
        },
        {
          label: "order lines, with their order",
          sqlServer: `SELECT o.CustomerPurchaseOrderNumber AS OrderPO, o.CustomerID AS OrderCustomer, CASE WHEN o.OrderID IS NULL THEN N'orphan' ELSE N'ok' END AS HasOrder,
                        ol.StockItemID, ol.Description, ol.PackageTypeID, ol.Quantity, ol.UnitPrice, ol.TaxRate, ol.PickedQuantity, ol.PickingCompletedWhen,
                        ol.LastEditedBy, ${ssNow("ol.LastEditedWhen", "LastEditedWhen")}
                      FROM Sales.OrderLines AS ol LEFT JOIN Sales.Orders AS o ON o.OrderID = ol.OrderID`,
          postgres: `SELECT o."CustomerPurchaseOrderNumber" AS "OrderPO", o."CustomerID" AS "OrderCustomer", CASE WHEN o."OrderID" IS NULL THEN 'orphan' ELSE 'ok' END AS "HasOrder",
                       ol."StockItemID", ol."Description", ol."PackageTypeID", ol."Quantity", ol."UnitPrice", ol."TaxRate", ol."PickedQuantity", ol."PickingCompletedWhen",
                       ol."LastEditedBy", ${pgNow('ol."LastEditedWhen"', "LastEditedWhen")}
                     FROM sales.order_lines AS ol LEFT JOIN sales.orders AS o ON o."OrderID" = ol."OrderID"`,
        },
        {
          label: "order IDs allocated",
          sqlServer: `SELECT COUNT(*) AS Orders, COUNT(DISTINCT OrderID) AS DistinctIDs, MIN(OrderID) AS FirstID, MAX(OrderID) AS LastID FROM Sales.Orders`,
          postgres: `SELECT COUNT(*) AS "Orders", COUNT(DISTINCT "OrderID") AS "DistinctIDs", MIN("OrderID") AS "FirstID", MAX("OrderID") AS "LastID" FROM sales.orders`,
        },
        {
          label: "next order ID",
          sqlServer: `SELECT NEXT VALUE FOR Sequences.OrderID AS NextOrderID`,
          postgres: `SELECT nextval('sequences."OrderID"') AS "NextOrderID"`,
        },
      ],
    },
    fixedCases: fixedCases(),
    mutants: [
      { name: "lines priced at the list price (no customer pricing)", from: `website.calculate_customer_price(o."CustomerID", ol."StockItemID", localtimestamp::date)`, to: `si."UnitPrice"` },
      { name: "priced on the expected delivery date", from: `website.calculate_customer_price(o."CustomerID", ol."StockItemID", localtimestamp::date)`, to: `website.calculate_customer_price(o."CustomerID", ol."StockItemID", o."ExpectedDeliveryDate")` },
      { name: "picked quantity set to the ordered quantity", from: `si."TaxRate", 0, NULL`, to: `si."TaxRate", ol."Quantity", NULL` },
      { name: "lines for unknown stock items kept", from: "INNER JOIN warehouse.stock_items AS si", to: "LEFT JOIN warehouse.stock_items AS si" },
      { name: "salesperson taken from the created-by argument", from: `salesperson_person_id, NULL, o."ContactPersonID"`, to: `orders_created_by_person_id, NULL, o."ContactPersonID"` },
      // proves the 'today' observation is not a blind spot
      { name: "order date set to the expected delivery date", from: `o."ContactPersonID", NULL, localtimestamp::date,`, to: `o."ContactPersonID", NULL, o."ExpectedDeliveryDate",` },
    ],
    notes: [
      "WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.",
      "Table-valued parameters Website.OrderList / Website.OrderLineList become composite types website.order_list / website.order_line_list and array parameters; the harness passes the same generated rows to both engines. In the source both types are memory-optimized; here they are disk-based (the procedure is interpreted T-SQL, so storage does not change its result).",
      "NEXT VALUE FOR Sequences.OrderID -> nextval('sequences.\"OrderID\"'). As in SQL Server, values are consumed even when the transaction rolls back. The source assigns them to the rows of @Orders in an undefined order, so order IDs are compared as a set, and each line is matched to its order through the order's purchase-order number and customer.",
      "SYSDATETIME() -> localtimestamp. Compared as 'today' / 'within the last 5 minutes' on each engine's own clock; the exact time is not claimed.",
      "TRY/CATCH with XACT_ABORT, ROLLBACK and THROW (re-raise) -> an exception block that re-raises. The outcome compares the error class each engine raised (NOT NULL violation 515/23502, string truncation 8152 or 2628/22001, numeric overflow 8115/22003).",
      "Depends on Website.CalculateCustomerPrice: SQL Server runs its original definition, PostgreSQL its verified conversion. Generated special deals are dated around the day of the run so that customer pricing applies.",
      "Preconditions: OrderReference is unique within @Orders (it is the key of @OrdersToGenerate). Sales.Orders and Sales.OrderLines start empty.",
      "Step 4 is not run: the call changes the data it reads.",
    ],
  },
];

function fixedCases(): FixedCase[] {
  const order = (ref: number, over: Partial<Row> = {}): Row => ({
    OrderReference: ref, CustomerID: 1, ContactPersonID: 3, ExpectedDeliveryDate: "2030-01-01", CustomerPurchaseOrderNumber: `PO-${ref}`,
    IsUndersupplyBackordered: false, Comments: null, DeliveryInstructions: null, ...over,
  });
  const line = (ref: number, stock: number, over: Partial<Row> = {}): Row => ({ OrderReference: ref, StockItemID: stock, Description: `line ${ref}/${stock}`, Quantity: 2, ...over });
  const base = (orders: Row[], lines: Row[], deals: Row[] = []): Record<string, Row[]> => ({
    "Website.OrderList": orders, "Website.OrderLineList": lines, "Sales.Orders": [], "Sales.OrderLines": [],
    "Warehouse.StockItems": [{ StockItemID: 1, UnitPackageID: 7, TaxRate: "15.000", UnitPrice: "10.00" }, { StockItemID: 2, UnitPackageID: 9, TaxRate: "10.000", UnitPrice: "99.99" }],
    "Sales.Customers": [{ CustomerID: 1, BuyingGroupID: null, CustomerCategoryID: 1 }, { CustomerID: 2, BuyingGroupID: 1, CustomerCategoryID: 2 }],
    "Sales.SpecialDeals": deals, "Warehouse.StockItemStockGroups": [],
  });
  const deal = (over: Partial<Row>): Row => ({
    SpecialDealID: 1, StockItemID: 1, CustomerID: null, BuyingGroupID: null, CustomerCategoryID: null, StockGroupID: null,
    StartDate: dayFromToday(-1), EndDate: dayFromToday(1), DiscountAmount: null, DiscountPercentage: null, UnitPrice: null, ...over,
  });
  return [
    { label: "two orders with two lines each", args: [1, 2], tables: base([order(1), order(2, { CustomerID: 2 })], [line(1, 1), line(1, 2), line(2, 1), line(2, 2)]) },
    { label: "a line for an unknown stock item is dropped (INNER JOIN)", args: [1, 2], tables: base([order(1)], [line(1, 1), line(1, 99)]) },
    { label: "a line for an unknown order reference is dropped", args: [1, 2], tables: base([order(1)], [line(1, 1), line(5, 1)]) },
    { label: "a special deal valid today lowers the line price", args: [1, 2], tables: base([order(1)], [line(1, 1)], [deal({ UnitPrice: "7.50" })]) },
    { label: "a deal that ended yesterday does not apply", args: [1, 2], tables: base([order(1)], [line(1, 1)], [deal({ StartDate: dayFromToday(-5), EndDate: dayFromToday(-1), UnitPrice: "7.50" })]) },
    { label: "NULL customer: NOT NULL violation, nothing inserted, order IDs still consumed", args: [1, 2], tables: base([order(1), order(2, { CustomerID: null })], [line(1, 1)]) },
    // found by the property check (seed 1641288470): every order's ID is allocated before the insert fails
    { label: "a NULL in the second of three orders: all three IDs are consumed", args: [16, 10], tables: base([order(1), order(2, { ExpectedDeliveryDate: null }), order(3)], [line(1, 2)]) },
    { label: "NULL line description: NOT NULL violation, the orders are rolled back too", args: [1, 2], tables: base([order(1)], [line(1, 1, { Description: null })]) },
    { label: "no orders: nothing happens", args: [1, 2], tables: base([], []) },
  ];
}
