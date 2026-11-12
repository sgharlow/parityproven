/**
 * Website.InvoiceCustomerOrders (WideWorldImporters): for a table-valued list of order IDs, checks every order exists, is
 * picked and is not yet invoiced (else THROW 51000), allocates invoice IDs from Sequences.InvoiceID, and in one
 * transaction writes Sales.Invoices (with a JSON delivery record), Sales.InvoiceLines, Warehouse.StockItemTransactions,
 * Sales.CustomerTransactions and decrements Warehouse.StockItemHoldings.
 *
 * Step 3, state form. Compared:
 *  - The outcome: completed, or the error class raised (THROW 51000, NOT NULL violation, more than one row from a scalar
 *    subquery, numeric overflow).
 *  - Every invoice (identified by its OrderID; the source assigns invoice IDs to orders in an undefined order), every
 *    invoice line, stock transaction and customer transaction joined to its invoice's OrderID, every stock holding,
 *    the set of invoice IDs allocated, and the sequence's next value.
 *  - ReturnedDeliveryData as exact text, with the event time compared as "the call's time" (its length and last
 *    character are kept: CONVERT(nvarchar(20), SYSDATETIME(), 126) ends in "." when the time has a fraction) and the
 *    ConNote compared against the invoice's own ID + 1050.
 */

import type { ColSpec, FixedCase, ObjectSpec, Row } from "../harness/generic/spec.js";
import { pgNow, pgToday, ssNow, ssToday, WINDOW } from "./observe.js";

const int = { kind: "int" } as const;
const bit = { kind: "bit" } as const;
const date = { kind: "date" } as const;
const dt2 = { kind: "datetime2" } as const;
const nv = (n: number) => ({ kind: "nvarchar", n }) as const;
const dec = (p: number, s: number) => ({ kind: "decimal", p, s }) as const;
const pk = (name: string): ColSpec => ({ name, type: int, role: "pk" });
const ref = (name: string, nullable = false): ColSpec => ({ name, type: int, role: "ref", nullable });
const col = (name: string, type: ColSpec["type"], extra: Partial<ColSpec> = {}): ColSpec => ({ name, type, nullable: false, ...extra });

const INVOICE_SEQUENCE_START = 70511;   // Sequences.InvoiceID START WITH in the source database
const RARE = 0.03;
/** Application.TransactionTypes as in the source (the procedure looks two of them up by name). */
const TRANSACTION_TYPES: Row[] = [
  { TransactionTypeID: 1, TransactionTypeName: "Customer Invoice" }, { TransactionTypeID: 3, TransactionTypeName: "Customer Payment Received" },
  { TransactionTypeID: 10, TransactionTypeName: "Stock Issue" }, { TransactionTypeID: 11, TransactionTypeName: "Stock Receipt" },
];

// ReturnedDeliveryData, exact text with the call-time and invoice-ID parts replaced by descriptions
const ssDelivery = (d: string, id: string): string => {
  const ev = `JSON_VALUE(${d}, N'$.Events[0].EventTime')`;
  return `CASE WHEN ISJSON(${d}) = 1 AND ${ev} IS NOT NULL THEN
            REPLACE(REPLACE(${d},
              N'"EventTime":"' + ${ev} + N'"',
              N'"EventTime":"' + CASE WHEN TRY_CAST(LEFT(${ev}, 19) AS datetime2) BETWEEN DATEADD(minute, -${WINDOW}, SYSDATETIME()) AND SYSDATETIME()
                                     THEN N'<call time, ' + CAST(LEN(${ev}) AS nvarchar(5)) + N' chars, ends ' + RIGHT(${ev}, 1) + N'>'
                                     ELSE ${ev} END + N'"'),
              N'"ConNote":"EAN-125-' + CAST(${id} + 1050 AS nvarchar(20)) + N'"', N'"ConNote":"EAN-125-<InvoiceID + 1050>"')
          ELSE ${d} END AS ReturnedDeliveryData`;
};
const pgDelivery = (d: string, id: string): string => {
  const ev = `(CASE WHEN ${d} IS JSON OBJECT THEN ${d}::json #>> '{Events,0,EventTime}' END)`;
  return `CASE WHEN ${ev} IS NOT NULL THEN
            replace(replace(${d},
              '"EventTime":"' || ${ev} || '"',
              '"EventTime":"' || CASE WHEN ${ev} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
                                       AND left(${ev}, 19)::timestamp BETWEEN localtimestamp - interval '${WINDOW} minutes' AND localtimestamp
                                     THEN '<call time, ' || length(${ev}) || ' chars, ends ' || right(${ev}, 1) || '>'
                                     ELSE ${ev} END || '"'),
              '"ConNote":"EAN-125-' || (${id} + 1050) || '"', '"ConNote":"EAN-125-<InvoiceID + 1050>"')
          ELSE ${d} END AS "ReturnedDeliveryData"`;
};

export const INVOICE_SPECS: ObjectSpec[] = [
  {
    database: "WideWorldImporters", schema: "Website", name: "InvoiceCustomerOrders", objectClass: "procedure",
    windowParams: false, orderKey: [],
    pgFunction: "website.invoice_customer_orders",
    params: [
      { name: "PackedByPersonID", type: int, range: [1, 20], special: [1, 5] },
      { name: "InvoicedByPersonID", type: int, range: [1, 20], special: [2, 9] },
    ],
    ssCall: "EXEC Website.InvoiceCustomerOrders @OrdersToInvoice = ?, @PackedByPersonID = ?, @InvoicedByPersonID = ?",
    pgCall: "CALL {fn}(website.order_id_list_from_json($1::jsonb), $2::integer, $3::integer)",
    setup: {
      sqlServer: ["CREATE SCHEMA Sequences", `CREATE SEQUENCE Sequences.InvoiceID AS int START WITH ${INVOICE_SEQUENCE_START} MINVALUE -2147483648`],
      postgres: ["CREATE SCHEMA IF NOT EXISTS sequences", `DROP SEQUENCE IF EXISTS sequences."InvoiceID"`, `CREATE SEQUENCE sequences."InvoiceID" AS integer START WITH ${INVOICE_SEQUENCE_START} MINVALUE -2147483648`],
    },
    sampleSetup: () => ({
      sqlServer: [`ALTER SEQUENCE Sequences.InvoiceID RESTART WITH ${INVOICE_SEQUENCE_START}`],
      postgres: [`ALTER SEQUENCE sequences."InvoiceID" RESTART WITH ${INVOICE_SEQUENCE_START}`],
    }),
    tables: [
      // Website.OrderIDList: OrderID is its primary key in the source type, so the list has no duplicates
      { schema: "Website", name: "OrderIDList", tvp: { argIndex: 0 }, rows: [1, 2], columns: [pk("OrderID")] },
      {
        schema: "Sales", name: "Orders",
        columns: [
          pk("OrderID"), ref("CustomerID"), col("ContactPersonID", int, { range: [1, 20] }), col("SalespersonPersonID", int, { range: [1, 20] }),
          col("CustomerPurchaseOrderNumber", nv(20), { nullable: true }), col("PickingCompletedWhen", dt2, { nullable: true, nullFraction: 0.05 }),
        ],
      },
      {
        // enough lines that each order usually has some (an order without lines fails on NULL totals; covered by a fixed case)
        schema: "Sales", name: "OrderLines", rows: [2, 6],
        columns: [
          pk("OrderLineID"), ref("OrderID"), ref("StockItemID"), col("Description", nv(100)), col("PackageTypeID", int, { range: [1, 9] }),
          col("PickedQuantity", int, { range: [0, 50] }), col("UnitPrice", dec(18, 2), { nullable: true, nullFraction: RARE }), col("TaxRate", dec(18, 3)),
        ],
      },
      { schema: "Warehouse", name: "StockItems", columns: [pk("StockItemID"), col("IsChillerStock", bit)] },
      {
        schema: "Warehouse", name: "StockItemHoldings",
        columns: [pk("StockItemID"), col("QuantityOnHand", int), col("LastCostPrice", dec(18, 2)), col("LastEditedBy", int, { range: [1, 20] }), col("LastEditedWhen", dt2)],
      },
      {
        schema: "Sales", name: "Customers",
        columns: [
          pk("CustomerID"), ref("BillToCustomerID"), col("DeliveryMethodID", int, { range: [1, 10] }), col("PrimaryContactPersonID", int, { range: [1, 20] }),
          col("DeliveryAddressLine1", nv(60), { strings: ["Shop 12", "Unit 5", ""] }), col("DeliveryAddressLine2", nv(60), { nullable: true, strings: ["1 Main St", ""] }),
          col("DeliveryRun", nv(5), { nullable: true }), col("RunPosition", nv(5), { nullable: true }),
        ],
      },
      {
        // existing invoices: an order that already has one cannot be invoiced again
        schema: "Sales", name: "Invoices", rows: [0, 1],
        columns: [
          pk("InvoiceID"), col("CustomerID", int), col("BillToCustomerID", int), { ...ref("OrderID", true), nullFraction: 0.6 }, col("DeliveryMethodID", int), col("ContactPersonID", int),
          col("AccountsPersonID", int), col("SalespersonPersonID", int), col("PackedByPersonID", int), col("InvoiceDate", date),
          col("CustomerPurchaseOrderNumber", nv(20), { nullable: true }), col("IsCreditNote", bit), col("CreditNoteReason", nv(400), { nullable: true }),
          col("Comments", nv(400), { nullable: true }), col("DeliveryInstructions", nv(400), { nullable: true }), col("InternalComments", nv(400), { nullable: true }),
          col("TotalDryItems", int), col("TotalChillerItems", int), col("DeliveryRun", nv(5), { nullable: true }), col("RunPosition", nv(5), { nullable: true }),
          col("ReturnedDeliveryData", nv(400), { nullable: true, strings: ['{"Events": []}'] }), col("LastEditedBy", int), col("LastEditedWhen", dt2),
        ],
      },
      {
        // InvoiceLineID is a sequence default in the source; an identity here (referenced only to order the inserts)
        schema: "Sales", name: "InvoiceLines", rows: [0, 0],
        columns: [
          { name: "InvoiceLineID", type: int, identity: true }, col("InvoiceID", int), col("StockItemID", int), col("Description", nv(100)), col("PackageTypeID", int),
          col("Quantity", int), col("UnitPrice", dec(18, 2), { nullable: true }), col("TaxRate", dec(18, 3)), col("TaxAmount", dec(18, 2)),
          col("LineProfit", dec(18, 2)), col("ExtendedPrice", dec(18, 2)), col("LastEditedBy", int), col("LastEditedWhen", dt2),
        ],
      },
      { schema: "Application", name: "TransactionTypes", rows: [4, 4], columns: [pk("TransactionTypeID"), col("TransactionTypeName", nv(50))] },
      {
        schema: "Warehouse", name: "StockItemTransactions", rows: [0, 0],
        columns: [
          col("StockItemID", int), col("TransactionTypeID", int), col("CustomerID", int, { nullable: true }), col("InvoiceID", int, { nullable: true }),
          col("SupplierID", int, { nullable: true }), col("PurchaseOrderID", int, { nullable: true }), col("TransactionOccurredWhen", dt2),
          col("Quantity", dec(18, 3)), col("LastEditedBy", int), col("LastEditedWhen", dt2),
        ],
      },
      {
        schema: "Sales", name: "CustomerTransactions", rows: [0, 0],
        columns: [
          col("CustomerID", int), col("TransactionTypeID", int), col("InvoiceID", int, { nullable: true }), col("PaymentMethodID", int, { nullable: true }),
          col("TransactionDate", date), col("AmountExcludingTax", dec(18, 2)), col("TaxAmount", dec(18, 2)), col("TransactionAmount", dec(18, 2)),
          col("OutstandingBalance", dec(18, 2)), col("FinalizationDate", date, { nullable: true }), col("LastEditedBy", int), col("LastEditedWhen", dt2),
        ],
      },
    ],
    prepare: (d) => { d.tables["Application.TransactionTypes"] = TRANSACTION_TYPES.map((r) => ({ ...r })); },
    // coverage: the sample reaches the invoicing transaction (every requested order exists, is picked and is not yet invoiced)
    informativeData: (d) => {
      const orders = d.tables["Sales.Orders"] ?? [];
      const invoiced = new Set((d.tables["Sales.Invoices"] ?? []).map((i) => i.OrderID));
      return (d.tables["Website.OrderIDList"] ?? []).every((x) => {
        const o = orders.find((r) => r.OrderID === x.OrderID);
        return !!o && o.PickingCompletedWhen !== null && !invoiced.has(x.OrderID);
      });
    },
    stateCheck: {
      tables: [],
      sqlServerErrors: [],
      postgresErrors: [],
      errorClasses: [
        { label: "THROW 51000 (order missing, not picked or already invoiced)", sqlServer: [51000], postgres: ["P0001"] },
        { label: "NULL into a NOT NULL column", sqlServer: [515], postgres: ["23502"] },
        { label: "scalar subquery returned more than one row", sqlServer: [512], postgres: ["21000"] },
        { label: "numeric overflow", sqlServer: [8115, 220], postgres: ["22003"] },
      ],
      queries: [
        {
          label: "invoices",
          sqlServer: `SELECT i.OrderID, CASE WHEN i.InvoiceID >= ${INVOICE_SEQUENCE_START} THEN N'new' ELSE CAST(i.InvoiceID AS nvarchar(10)) END AS Invoice,
                        i.CustomerID, i.BillToCustomerID, i.DeliveryMethodID, i.ContactPersonID, i.AccountsPersonID, i.SalespersonPersonID, i.PackedByPersonID,
                        ${ssToday("i.InvoiceDate", "InvoiceDate")}, i.CustomerPurchaseOrderNumber, i.IsCreditNote, i.CreditNoteReason, i.Comments,
                        i.DeliveryInstructions, i.InternalComments, i.TotalDryItems, i.TotalChillerItems, i.DeliveryRun, i.RunPosition,
                        ${ssDelivery("i.ReturnedDeliveryData", "i.InvoiceID")}, i.LastEditedBy, ${ssNow("i.LastEditedWhen", "LastEditedWhen")}
                      FROM Sales.Invoices AS i`,
          postgres: `SELECT i."OrderID", CASE WHEN i."InvoiceID" >= ${INVOICE_SEQUENCE_START} THEN 'new' ELSE i."InvoiceID"::text END AS "Invoice",
                       i."CustomerID", i."BillToCustomerID", i."DeliveryMethodID", i."ContactPersonID", i."AccountsPersonID", i."SalespersonPersonID", i."PackedByPersonID",
                       ${pgToday('i."InvoiceDate"', "InvoiceDate")}, i."CustomerPurchaseOrderNumber", i."IsCreditNote", i."CreditNoteReason", i."Comments",
                       i."DeliveryInstructions", i."InternalComments", i."TotalDryItems", i."TotalChillerItems", i."DeliveryRun", i."RunPosition",
                       ${pgDelivery('i."ReturnedDeliveryData"', 'i."InvoiceID"')}, i."LastEditedBy", ${pgNow('i."LastEditedWhen"', "LastEditedWhen")}
                     FROM sales.invoices AS i`,
        },
        {
          label: "invoice lines, by their invoice's order",
          sqlServer: `SELECT i.OrderID AS InvoiceOrder, il.StockItemID, il.Description, il.PackageTypeID, il.Quantity, il.UnitPrice, il.TaxRate, il.TaxAmount,
                        il.LineProfit, il.ExtendedPrice, il.LastEditedBy, ${ssNow("il.LastEditedWhen", "LastEditedWhen")}
                      FROM Sales.InvoiceLines AS il LEFT JOIN Sales.Invoices AS i ON i.InvoiceID = il.InvoiceID`,
          postgres: `SELECT i."OrderID" AS "InvoiceOrder", il."StockItemID", il."Description", il."PackageTypeID", il."Quantity", il."UnitPrice", il."TaxRate", il."TaxAmount",
                       il."LineProfit", il."ExtendedPrice", il."LastEditedBy", ${pgNow('il."LastEditedWhen"', "LastEditedWhen")}
                     FROM sales.invoice_lines AS il LEFT JOIN sales.invoices AS i ON i."InvoiceID" = il."InvoiceID"`,
        },
        {
          label: "stock transactions, by their invoice's order",
          sqlServer: `SELECT i.OrderID AS InvoiceOrder, t.StockItemID, t.TransactionTypeID, t.CustomerID, t.SupplierID, t.PurchaseOrderID,
                        ${ssNow("t.TransactionOccurredWhen", "TransactionOccurredWhen")}, t.Quantity, t.LastEditedBy, ${ssNow("t.LastEditedWhen", "LastEditedWhen")}
                      FROM Warehouse.StockItemTransactions AS t LEFT JOIN Sales.Invoices AS i ON i.InvoiceID = t.InvoiceID`,
          postgres: `SELECT i."OrderID" AS "InvoiceOrder", t."StockItemID", t."TransactionTypeID", t."CustomerID", t."SupplierID", t."PurchaseOrderID",
                       ${pgNow('t."TransactionOccurredWhen"', "TransactionOccurredWhen")}, t."Quantity", t."LastEditedBy", ${pgNow('t."LastEditedWhen"', "LastEditedWhen")}
                     FROM warehouse.stock_item_transactions AS t LEFT JOIN sales.invoices AS i ON i."InvoiceID" = t."InvoiceID"`,
        },
        {
          label: "customer transactions, by their invoice's order",
          sqlServer: `SELECT i.OrderID AS InvoiceOrder, ct.CustomerID, ct.TransactionTypeID, ct.PaymentMethodID, ${ssToday("ct.TransactionDate", "TransactionDate")},
                        ct.AmountExcludingTax, ct.TaxAmount, ct.TransactionAmount, ct.OutstandingBalance, ct.FinalizationDate, ct.LastEditedBy,
                        ${ssNow("ct.LastEditedWhen", "LastEditedWhen")}
                      FROM Sales.CustomerTransactions AS ct LEFT JOIN Sales.Invoices AS i ON i.InvoiceID = ct.InvoiceID`,
          postgres: `SELECT i."OrderID" AS "InvoiceOrder", ct."CustomerID", ct."TransactionTypeID", ct."PaymentMethodID", ${pgToday('ct."TransactionDate"', "TransactionDate")},
                       ct."AmountExcludingTax", ct."TaxAmount", ct."TransactionAmount", ct."OutstandingBalance", ct."FinalizationDate", ct."LastEditedBy",
                       ${pgNow('ct."LastEditedWhen"', "LastEditedWhen")}
                     FROM sales.customer_transactions AS ct LEFT JOIN sales.invoices AS i ON i."InvoiceID" = ct."InvoiceID"`,
        },
        {
          label: "stock holdings",
          sqlServer: `SELECT h.StockItemID, h.QuantityOnHand, h.LastCostPrice, h.LastEditedBy, ${ssNow("h.LastEditedWhen", "LastEditedWhen")} FROM Warehouse.StockItemHoldings AS h`,
          postgres: `SELECT h."StockItemID", h."QuantityOnHand", h."LastCostPrice", h."LastEditedBy", ${pgNow('h."LastEditedWhen"', "LastEditedWhen")} FROM warehouse.stock_item_holdings AS h`,
        },
        {
          // Which allocated ID an order received is undefined in the source (NEXT VALUE FOR without OVER (ORDER BY)), and it
          // becomes visible when an allocated invoice is not written (e.g. its customer row is missing). So only the
          // defined facts are compared: how many new IDs are used, that they are distinct, and that they lie in the allocated range.
          label: "invoice IDs used",
          sqlServer: `SELECT COUNT(*) AS Invoices, COUNT(DISTINCT InvoiceID) AS DistinctIDs,
                        CASE WHEN COUNT(*) = 0 OR MAX(InvoiceID) < (SELECT CAST(current_value AS int) FROM sys.sequences WHERE name = N'InvoiceID') + 1
                             THEN N'within the allocated range' ELSE N'outside' END AS InRange
                      FROM Sales.Invoices WHERE InvoiceID >= ${INVOICE_SEQUENCE_START}`,
          postgres: `SELECT COUNT(*) AS "Invoices", COUNT(DISTINCT "InvoiceID") AS "DistinctIDs",
                       CASE WHEN COUNT(*) = 0 OR MAX("InvoiceID") < (SELECT last_value FROM sequences."InvoiceID") + 1
                            THEN 'within the allocated range' ELSE 'outside' END AS "InRange"
                     FROM sales.invoices WHERE "InvoiceID" >= ${INVOICE_SEQUENCE_START}`,
        },
        {
          label: "next invoice ID",
          sqlServer: `SELECT NEXT VALUE FOR Sequences.InvoiceID AS NextInvoiceID`,
          postgres: `SELECT nextval('sequences."InvoiceID"') AS "NextInvoiceID"`,
        },
      ],
    },
    fixedCases: fixedCases(),
    mutants: [
      { name: "unpicked orders are invoiced", from: `AND o."PickingCompletedWhen" IS NOT NULL`, to: `` },
      { name: "chiller and dry item counts swapped", from: `THEN 0 ELSE 1 END`, to: `THEN 1 ELSE 0 END` },
      { name: "tax amount truncated instead of rounded", from: `round(ol."PickedQuantity" * ol."UnitPrice" * ol."TaxRate" / 100.0, 2),\n               round(ol."PickedQuantity" * (ol."UnitPrice"`, to: `trunc(ol."PickedQuantity" * ol."UnitPrice" * ol."TaxRate" / 100.0, 2),\n               round(ol."PickedQuantity" * (ol."UnitPrice"` },
      { name: "stock issued as a positive quantity", from: `0 - il."Quantity"`, to: `il."Quantity"` },
      { name: "event time keeps every fractional digit", from: `left(event_time_full, 20)`, to: `event_time_full` },
      { name: "customer transaction booked to the customer, not the bill-to customer", from: `SELECT i."BillToCustomerID",`, to: `SELECT i."CustomerID",` },
      { name: "missing address line 2 kept as line 1 (concat instead of ||)", from: `c."DeliveryAddressLine1" || ', ' || c."DeliveryAddressLine2"`, to: `concat(c."DeliveryAddressLine1", ', ', c."DeliveryAddressLine2")` },
    ],
    notes: [
      "WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.",
      "The table-valued parameter Website.OrderIDList becomes the composite type website.order_id_list and an array parameter. The @InvoicesToGenerate table variable becomes a temporary table dropped at commit.",
      "NEXT VALUE FOR Sequences.InvoiceID -> nextval('sequences.\"InvoiceID\"'), one value per qualifying order, consumed even when the call fails. Which order receives which ID is undefined in the source, so it is not claimed: each invoice is identified by its OrderID, and the IDs used are compared by count, distinctness and range, with the sequence's next value.",
      "SYSDATETIME() -> localtimestamp. CONVERT(nvarchar(20), SYSDATETIME(), 126) keeps 20 characters of the ISO text (ending in '.' when the time has a fraction; 19 characters, no fraction, on a whole second); reproduced. The JSON_MODIFY chain produces fixed text, which the conversion builds directly; the stored text is compared exactly apart from the call time and the invoice-ID-based ConNote.",
      "c.DeliveryAddressLine1 + N', ' + c.DeliveryAddressLine2 is NULL when line 2 is NULL; || keeps that (concat() would not).",
      "TRY/CATCH with XACT_ABORT, THROW 51000 and THROW (re-raise) -> an exception block that undoes every write and re-raises the same error. The outcome compares the error class each engine raised.",
      "Transaction types are looked up by name ('Stock Issue', 'Customer Invoice'). SQL Server compares under the database's case-insensitive collation and PostgreSQL case-sensitively; the generated names are the source's exact names, so case differences are not claimed.",
      "Scratch modelling: Sales.InvoiceLines.InvoiceLineID is an identity column (a sequence default in the source; the procedure only uses it to order inserts). StockItemTransactionID and CustomerTransactionID (sequence defaults, not referenced) are not modelled.",
    ],
  },
];

function fixedCases(): FixedCase[] {
  const NOW_PICKED = "2020-01-01T10:00:00.000000";
  const base = (over: Partial<Record<string, Row[]>> = {}): Record<string, Row[]> => ({
    "Website.OrderIDList": [{ OrderID: 1 }],
    "Sales.Orders": [
      { OrderID: 1, CustomerID: 1, ContactPersonID: 3, SalespersonPersonID: 7, CustomerPurchaseOrderNumber: "PO-1", PickingCompletedWhen: NOW_PICKED },
      { OrderID: 2, CustomerID: 2, ContactPersonID: 4, SalespersonPersonID: 8, CustomerPurchaseOrderNumber: null, PickingCompletedWhen: NOW_PICKED },
    ],
    "Sales.OrderLines": [
      { OrderLineID: 1, OrderID: 1, StockItemID: 1, Description: "dry", PackageTypeID: 7, PickedQuantity: 3, UnitPrice: "0.99", TaxRate: "0.505" },
      { OrderLineID: 2, OrderID: 1, StockItemID: 2, Description: "chilled", PackageTypeID: 9, PickedQuantity: 2, UnitPrice: "10.00", TaxRate: "15.000" },
      { OrderLineID: 3, OrderID: 2, StockItemID: 1, Description: "dry", PackageTypeID: 7, PickedQuantity: 1, UnitPrice: "5.55", TaxRate: "10.000" },
    ],
    "Warehouse.StockItems": [{ StockItemID: 1, IsChillerStock: false }, { StockItemID: 2, IsChillerStock: true }],
    "Warehouse.StockItemHoldings": [
      { StockItemID: 1, QuantityOnHand: 100, LastCostPrice: "0.50", LastEditedBy: 1, LastEditedWhen: "2020-01-01T00:00:00.000000" },
      { StockItemID: 2, QuantityOnHand: 10, LastCostPrice: "6.00", LastEditedBy: 1, LastEditedWhen: "2020-01-01T00:00:00.000000" },
    ],
    "Sales.Customers": [
      { CustomerID: 1, BillToCustomerID: 2, DeliveryMethodID: 3, PrimaryContactPersonID: 11, DeliveryAddressLine1: "Shop 12", DeliveryAddressLine2: "1 Main St", DeliveryRun: "A", RunPosition: "1" },
      { CustomerID: 2, BillToCustomerID: 2, DeliveryMethodID: 3, PrimaryContactPersonID: 12, DeliveryAddressLine1: "Unit 5", DeliveryAddressLine2: null, DeliveryRun: null, RunPosition: null },
    ],
    "Sales.Invoices": [], "Sales.InvoiceLines": [], "Warehouse.StockItemTransactions": [], "Sales.CustomerTransactions": [],
    "Application.TransactionTypes": TRANSACTION_TYPES.map((r) => ({ ...r })),
    ...over,
  });
  return [
    { label: "one order, a dry and a chilled line (tax 0.99 x 0.505 % rounds to 0.00), billed to another customer", args: [5, 9], tables: base() },
    { label: "two orders; the second customer has no address line 2 (delivery instructions NULL)", args: [5, 9], tables: base({ "Website.OrderIDList": [{ OrderID: 1 }, { OrderID: 2 }] }) },
    { label: "an unknown order: THROW 51000, nothing written", args: [5, 9], tables: base({ "Website.OrderIDList": [{ OrderID: 1 }, { OrderID: 99 }] }) },
    {
      label: "an order that is not picked: THROW 51000",
      args: [5, 9],
      tables: base({ "Sales.Orders": [{ OrderID: 1, CustomerID: 1, ContactPersonID: 3, SalespersonPersonID: 7, CustomerPurchaseOrderNumber: "PO-1", PickingCompletedWhen: null }] }),
    },
    {
      label: "an order without lines: its customer transaction sums are NULL, a NOT NULL violation rolls everything back",
      args: [5, 9], tables: base({ "Sales.OrderLines": [] }),
    },
    {
      label: "the 'Stock Issue' transaction type appears twice: the scalar subquery fails",
      args: [5, 9], tables: base({ "Application.TransactionTypes": [...TRANSACTION_TYPES.map((r) => ({ ...r })), { TransactionTypeID: 20, TransactionTypeName: "Stock Issue" }] }),
    },
  ];
}
