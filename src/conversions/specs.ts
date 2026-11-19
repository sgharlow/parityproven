/**
 * Object specs for the conversion loop. Column lists were derived from the T-SQL definitions
 * (sys.sql_modules) and types from INFORMATION_SCHEMA.COLUMNS on the restored WideWorldImporters.
 * Only columns the procedure references are declared.
 */

import type { ColSpec, FixedCase, ObjectSpec, Row, TableSpec } from "../harness/generic/spec.js";
import { AW_SPECS, AW_VIEWS } from "./specs-aw.js";
import { SEARCH_SPECS } from "./specs-search.js";
import { LOGON_SPECS } from "./specs-logon.js";
import { SEQUENCE_SPECS } from "./specs-sequences.js";
import { VEHICLE_SPECS } from "./specs-vehicle.js";
import { COLDROOM_SPECS } from "./specs-coldroom.js";
import { ORDER_SPECS } from "./specs-orders.js";
import { INVOICE_SPECS } from "./specs-invoices.js";
import { AW2_SPECS } from "./specs-aw2.js";

const int = { kind: "int" } as const;
const date = { kind: "date" } as const;
const dt2 = { kind: "datetime2" } as const;
const bit = { kind: "bit" } as const;
const dec = (p: number, s: number) => ({ kind: "decimal", p, s }) as const;
const nv = (n: number) => ({ kind: "nvarchar", n }) as const;

const pk = (name: string): ColSpec => ({ name, type: int, role: "pk" });
const ref = (name: string, nullable = false): ColSpec => ({ name, type: int, role: "ref", nullable });
const col = (name: string, type: ColSpec["type"], nullable = false): ColSpec => ({ name, type, nullable });

const packageTypes: TableSpec = {
  schema: "Warehouse", name: "PackageTypes",
  columns: [pk("PackageTypeID"), col("PackageTypeName", nv(50))],
};
const customers: TableSpec = {
  schema: "Sales", name: "Customers",
  columns: [pk("CustomerID"), col("DeliveryCityID", int)],
};

const WINDOW = { last: "2020-06-15T11:00:00.000000", new: "2020-06-15T13:00:00.000000" };
const IN_WINDOW_1 = "2020-06-15T12:00:00.000000";
const IN_WINDOW_2 = "2020-06-15T12:00:01.000000";
// window edges, to the microsecond (the harness's resolution): > @LastCutoff and <= @NewCutoff
const AT_LAST = "2020-06-15T11:00:00.000000";        // excluded
const JUST_AFTER_LAST = "2020-06-15T11:00:00.000001"; // included
const AT_NEW = "2020-06-15T13:00:00.000000";         // included
const JUST_AFTER_NEW = "2020-06-15T13:00:00.000001";  // excluded
const BEFORE = "2020-06-15T09:00:00.000000";         // older than the window

const base = { database: "WideWorldImporters", objectClass: "procedure" } as const;

export const SPECS: ObjectSpec[] = [
  {
    ...base, schema: "Integration", name: "GetMovementUpdates", windowParams: true,
    orderKey: ["WWI Stock Item Transaction ID"],
    pgFunction: "integration.get_movement_updates",
    tables: [{
      schema: "Warehouse", name: "StockItemTransactions",
      columns: [
        pk("StockItemTransactionID"), col("StockItemID", int), col("TransactionTypeID", int),
        col("CustomerID", int, true), col("InvoiceID", int, true), col("SupplierID", int, true),
        col("PurchaseOrderID", int, true), col("TransactionOccurredWhen", dt2),
        col("Quantity", dec(18, 3)), col("LastEditedWhen", dt2),
      ],
    }],
    // second case added 2026-11-18: the window edges, so the agreed tests see the cutoff comparisons (step 3 already did)
    fixedCases: [movementFirstCase(), movementEdgeCase()],
    mutants: [
      { name: "Quantity rounds instead of truncating", from: 'CAST(TRUNC(sit."Quantity") AS integer)', to: 'sit."Quantity"::integer' },
      { name: "upper cutoff exclusive", from: '<= new_cutoff', to: '< new_cutoff' },
    ],
    notes: ["WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted."],
  },
  {
    ...base, schema: "Integration", name: "GetOrderUpdates", windowParams: true,
    orderKey: ["WWI Order ID"],
    pgFunction: "integration.get_order_updates",
    tables: [
      { schema: "Sales", name: "Orders", columns: [
        pk("OrderID"), ref("CustomerID"), col("SalespersonPersonID", int), col("PickedByPersonID", int, true),
        col("BackorderOrderID", int, true), col("OrderDate", date), col("LastEditedWhen", dt2) ] },
      { schema: "Sales", name: "OrderLines", columns: [
        pk("OrderLineID"), ref("OrderID"), col("StockItemID", int), col("Description", nv(100)), ref("PackageTypeID"),
        col("Quantity", int), col("UnitPrice", dec(18, 2), true), col("TaxRate", dec(18, 3)),
        col("PickingCompletedWhen", dt2, true), col("LastEditedWhen", dt2) ] },
      packageTypes, customers,
    ],
    fixedCases: [{
      label: "tax amount at the intermediate-scale boundary (0.99 * 0.505 / 100; SQL Server gives 0.004999 at scale 6, ROUND(,2) = 0.00)", cutoffs: WINDOW,
      tables: {
        "Sales.Orders": [{ OrderID: 1, CustomerID: 1, SalespersonPersonID: 1, PickedByPersonID: null, BackorderOrderID: null, OrderDate: "2020-01-01", LastEditedWhen: IN_WINDOW_1 }],
        "Sales.OrderLines": [{ OrderLineID: 1, OrderID: 1, StockItemID: 1, Description: "x", PackageTypeID: 1, Quantity: 1, UnitPrice: "0.99", TaxRate: "0.505", PickingCompletedWhen: null, LastEditedWhen: IN_WINDOW_2 }],
        "Warehouse.PackageTypes": [{ PackageTypeID: 1, PackageTypeName: "Each" }],
        "Sales.Customers": [{ CustomerID: 1, DeliveryCityID: 1 }],
      },
    }, orderUpdatesEdgeCase()],
    mutants: [
      { name: "tax amount truncates instead of rounding at 2dp", from: "round(ol.\"Quantity\" * ol.\"UnitPrice\" * ol.\"TaxRate\" / 100.0, 2)", to: "trunc(ol.\"Quantity\" * ol.\"UnitPrice\" * ol.\"TaxRate\" / 100.0, 2)" },
      { name: "lower cutoff inclusive", from: "> last_cutoff", to: ">= last_cutoff" },
    ],
  },
  {
    ...base, schema: "Integration", name: "GetPurchaseUpdates", windowParams: true,
    orderKey: ["WWI Purchase Order ID"],
    pgFunction: "integration.get_purchase_updates",
    tables: [
      { schema: "Purchasing", name: "PurchaseOrders", columns: [
        pk("PurchaseOrderID"), col("SupplierID", int), col("OrderDate", date), col("LastEditedWhen", dt2) ] },
      { schema: "Purchasing", name: "PurchaseOrderLines", columns: [
        pk("PurchaseOrderLineID"), ref("PurchaseOrderID"), ref("StockItemID"), col("OrderedOuters", int),
        col("ReceivedOuters", int), ref("PackageTypeID"), col("IsOrderLineFinalized", bit), col("LastEditedWhen", dt2) ] },
      { schema: "Warehouse", name: "StockItems", columns: [pk("StockItemID"), col("QuantityPerOuter", int)] },
      packageTypes,
    ],
    mutants: [
      { name: "ordered quantity uses outers only", from: 'pol."OrderedOuters" * si."QuantityPerOuter"', to: 'pol."OrderedOuters"' },
      { name: "upper cutoff exclusive", from: "<= new_cutoff", to: "< new_cutoff" },
    ],
    fixedCases: [purchaseUpdatesCase()],
  },
  {
    ...base, schema: "Integration", name: "GetSaleUpdates", windowParams: true,
    orderKey: ["WWI Invoice ID"],
    pgFunction: "integration.get_sale_updates",
    tables: [
      { schema: "Sales", name: "Invoices", columns: [
        pk("InvoiceID"), ref("CustomerID"), ref("BillToCustomerID"), col("SalespersonPersonID", int),
        col("InvoiceDate", date), col("ConfirmedDeliveryTime", dt2, true), col("LastEditedWhen", dt2) ] },
      { schema: "Sales", name: "InvoiceLines", columns: [
        pk("InvoiceLineID"), ref("InvoiceID"), ref("StockItemID"), col("Description", nv(100)), ref("PackageTypeID"),
        col("Quantity", int), col("UnitPrice", dec(18, 2), true), col("TaxRate", dec(18, 3)), col("TaxAmount", dec(18, 2)),
        col("LineProfit", dec(18, 2)), col("ExtendedPrice", dec(18, 2)), col("LastEditedWhen", dt2) ] },
      { schema: "Warehouse", name: "StockItems", columns: [pk("StockItemID"), col("IsChillerStock", bit)] },
      packageTypes, customers,
    ],
    mutants: [
      { name: "chiller test inverted", from: 'CASE WHEN NOT si."IsChillerStock" THEN il."Quantity" ELSE 0 END', to: 'CASE WHEN si."IsChillerStock" THEN il."Quantity" ELSE 0 END' },
      { name: "bill-to join dropped to customer", from: 'bt."CustomerID" = i."BillToCustomerID"', to: 'bt."CustomerID" = i."CustomerID"' },
    ],
    notes: ["ORDER BY i.InvoiceID, il.InvoiceLineID: InvoiceLineID is not an output column, so rows sharing an InvoiceID are compared as a multiset."],
    fixedCases: [saleUpdatesCase()],
  },
  {
    ...base, schema: "Integration", name: "GetStockHoldingUpdates", windowParams: false,
    orderKey: ["WWI Stock Item ID"],
    pgFunction: "integration.get_stock_holding_updates",
    tables: [{
      schema: "Warehouse", name: "StockItemHoldings",
      columns: [
        pk("StockItemID"), col("QuantityOnHand", int), col("BinLocation", nv(20)), col("LastStocktakeQuantity", int),
        col("LastCostPrice", dec(18, 2)), col("ReorderLevel", int), col("TargetStockLevel", int),
      ],
    }],
    mutants: [
      { name: "descending order", from: 'ORDER BY sih."StockItemID"', to: 'ORDER BY sih."StockItemID" DESC' },
      { name: "swapped reorder / target", from: 'sih."ReorderLevel",\n        sih."TargetStockLevel"', to: 'sih."TargetStockLevel",\n        sih."ReorderLevel"' },
    ],
    fixedCases: [stockHoldingCase()],
  },
  {
    ...base, schema: "Integration", name: "GetTransactionUpdates", windowParams: true,
    orderKey: [],
    pgFunction: "integration.get_transaction_updates",
    tables: [
      { schema: "Sales", name: "CustomerTransactions", columns: [
        pk("CustomerTransactionID"), ref("CustomerID"), col("TransactionTypeID", int), ref("InvoiceID", true),
        col("PaymentMethodID", int, true), col("TransactionDate", date), col("AmountExcludingTax", dec(18, 2)),
        col("TaxAmount", dec(18, 2)), col("TransactionAmount", dec(18, 2)), col("OutstandingBalance", dec(18, 2)),
        col("IsFinalized", bit, true), col("LastEditedWhen", dt2) ] },
      { schema: "Sales", name: "Invoices", columns: [pk("InvoiceID"), ref("CustomerID")] },
      { schema: "Purchasing", name: "SupplierTransactions", columns: [
        pk("SupplierTransactionID"), col("SupplierID", int), col("TransactionTypeID", int), col("PurchaseOrderID", int, true),
        col("PaymentMethodID", int, true), col("SupplierInvoiceNumber", nv(20), true), col("TransactionDate", date),
        col("AmountExcludingTax", dec(18, 2)), col("TaxAmount", dec(18, 2)), col("TransactionAmount", dec(18, 2)),
        col("OutstandingBalance", dec(18, 2)), col("IsFinalized", bit, true), col("LastEditedWhen", dt2) ] },
    ],
    mutants: [
      { name: "customer id taken from transaction only", from: 'COALESCE(i."CustomerID", ct."CustomerID")', to: 'ct."CustomerID"' },
      { name: "LEFT OUTER JOIN to invoices becomes INNER JOIN", from: "LEFT OUTER JOIN", to: "INNER JOIN" },
    ],
    notes: ["Source has no ORDER BY; the whole result is compared as a multiset."],
    fixedCases: [transactionUpdatesCase()],
  },
];

/** Integration.GetMovementUpdates case 1 (unchanged since 2026-11-12): fractional quantities truncate in the int cast. */
function movementFirstCase(): FixedCase {
  return {
    label: "fractional Quantity (decimal -> int cast)", cutoffs: WINDOW,
    tables: { "Warehouse.StockItemTransactions": [2.5, -2.5, 0.999].map((q, i) => ({
      StockItemTransactionID: i + 1, StockItemID: 1, TransactionTypeID: 1, CustomerID: null,
      InvoiceID: null, SupplierID: null, PurchaseOrderID: null,
      TransactionOccurredWhen: IN_WINDOW_1, Quantity: q.toFixed(3), LastEditedWhen: IN_WINDOW_2,
    })) },
  };
}

/**
 * Integration.GetMovementUpdates case 2 (added 2026-11-18): LastEditedWhen at each window edge. Expected 2 rows
 * (transactions 2 and 3): exactly @LastCutoff is excluded, 1 µs after it included, exactly @NewCutoff included, 1 µs
 * after it excluded.
 */
function movementEdgeCase(): FixedCase {
  return {
    label: "window edges to the microsecond: at @LastCutoff excluded, +1 µs included, at @NewCutoff included, +1 µs excluded",
    cutoffs: WINDOW,
    tables: { "Warehouse.StockItemTransactions": [AT_LAST, JUST_AFTER_LAST, AT_NEW, JUST_AFTER_NEW].map((edited, i) => ({
      StockItemTransactionID: i + 1, StockItemID: 1, TransactionTypeID: 1, CustomerID: null,
      InvoiceID: null, SupplierID: null, PurchaseOrderID: null,
      TransactionOccurredWhen: IN_WINDOW_1, Quantity: "1.000", LastEditedWhen: edited,
    })) },
  };
}

/**
 * Integration.GetOrderUpdates case 2 (added 2026-11-18). Last Modified = the later of order and line LastEditedWhen.
 * Expected 2 rows (orders 2 and 3):
 *  - order 1: modified exactly at @LastCutoff (excluded, the lower bound is exclusive)
 *  - order 2: 1 µs after @LastCutoff (included); tax 1 x 9.99 x 15% = 1.4985, which ROUND(, 2) makes 1.50
 *    (truncation would give 1.49); Total Excluding Tax 9.99; Total Including Tax 11.49
 *  - order 3: exactly @NewCutoff (included); tax 3 x 0.35 x 10% = 0.105, rounds to 0.11 (truncation: 0.10)
 */
function orderUpdatesEdgeCase(): FixedCase {
  const order = (id: number, edited: string): Row =>
    ({ OrderID: id, CustomerID: 1, SalespersonPersonID: 1, PickedByPersonID: null, BackorderOrderID: null, OrderDate: "2020-06-15", LastEditedWhen: edited });
  const line = (id: number, orderId: number, qty: number, price: string, rate: string): Row =>
    ({ OrderLineID: id, OrderID: orderId, StockItemID: 1, Description: `line ${id}`, PackageTypeID: 1, Quantity: qty, UnitPrice: price, TaxRate: rate, PickingCompletedWhen: null, LastEditedWhen: BEFORE });
  return {
    label: "window lower edge (at @LastCutoff excluded, +1 µs included; @NewCutoff included); tax rounds half up at 2 dp: 1.4985 -> 1.50 and 0.105 -> 0.11 (truncation would give 1.49 and 0.10)",
    cutoffs: WINDOW,
    tables: {
      "Sales.Orders": [order(1, AT_LAST), order(2, JUST_AFTER_LAST), order(3, AT_NEW)],
      "Sales.OrderLines": [line(1, 1, 1, "9.99", "15.000"), line(2, 2, 1, "9.99", "15.000"), line(3, 3, 3, "0.35", "10.000")],
      "Warehouse.PackageTypes": [{ PackageTypeID: 1, PackageTypeName: "Each" }],
      "Sales.Customers": [{ CustomerID: 1, DeliveryCityID: 1 }],
    },
  };
}

/**
 * Integration.GetPurchaseUpdates (hand-derived). "Last modified" = the later of the order's and the line's LastEditedWhen.
 * Expected: 4 rows (orders 2, 3, 5, 6).
 *  - order 1: modified exactly at @LastCutoff (excluded, the lower bound is exclusive)
 *  - order 2: the order is older than the window, its line 1 µs after @LastCutoff (included: the line's time counts)
 *  - order 3: modified exactly at @NewCutoff (included, the upper bound is inclusive)
 *  - order 4: 1 µs after @NewCutoff (excluded)
 *  - order 5: three lines in the window; one has no StockItem row and one no PackageType row (both dropped)
 *  - order 6: order and line modified at the same instant (the ELSE branch picks the order's, same value); 29 Feb date
 *  - Ordered Quantity = OrderedOuters * QuantityPerOuter (3 * 12 = 36; 0 * 12 = 0); IsOrderLineFinalized 1 and 0
 */
function purchaseUpdatesCase(): FixedCase {
  const po = (id: number, edited: string, date = "2020-06-01"): Row => ({ PurchaseOrderID: id, SupplierID: 7, OrderDate: date, LastEditedWhen: edited });
  const line = (id: number, order: number, item: number, pkg: number, outers: number, edited: string, fin = 0): Row =>
    ({ PurchaseOrderLineID: id, PurchaseOrderID: order, StockItemID: item, OrderedOuters: outers, ReceivedOuters: outers ? 1 : 0, PackageTypeID: pkg, IsOrderLineFinalized: fin, LastEditedWhen: edited });
  return {
    label: "window edges to the microsecond (at @LastCutoff excluded, +1 µs included, at @NewCutoff included, +1 µs excluded); a line newer than its order counts; missing stock item or package type drops the line; Ordered Quantity = outers x quantity per outer",
    cutoffs: WINDOW,
    tables: {
      "Purchasing.PurchaseOrders": [po(1, AT_LAST), po(2, BEFORE), po(3, AT_NEW), po(4, JUST_AFTER_NEW), po(5, IN_WINDOW_1), po(6, IN_WINDOW_2, "2020-02-29")],
      "Purchasing.PurchaseOrderLines": [
        line(1, 1, 1, 1, 3, BEFORE), line(2, 2, 1, 1, 3, JUST_AFTER_LAST, 1), line(3, 3, 1, 1, 3, BEFORE), line(4, 4, 1, 1, 3, BEFORE),
        line(5, 5, 2, 1, 0, IN_WINDOW_1), line(6, 5, 99, 1, 3, IN_WINDOW_1), line(7, 5, 1, 99, 3, IN_WINDOW_1),
        line(8, 6, 1, 1, 3, IN_WINDOW_2),
      ],
      "Warehouse.StockItems": [{ StockItemID: 1, QuantityPerOuter: 12 }, { StockItemID: 2, QuantityPerOuter: 12 }],
      "Warehouse.PackageTypes": [{ PackageTypeID: 1, PackageTypeName: "Carton" }],
    },
  };
}

/**
 * Integration.GetSaleUpdates (hand-derived). Expected: 4 rows (invoice 1: two lines; invoice 4: one line; invoice 5: one).
 *  - invoice 1 (in the window): a dry line (IsChillerStock 0: dry = Quantity, chiller = 0) and a chiller line (the
 *    reverse); Total Excluding Tax = ExtendedPrice - TaxAmount (10.00 - 1.50 = 8.50); one UnitPrice NULL; a description
 *    with a trailing space; ConfirmedDeliveryTime NULL (Delivery Date Key NULL); bill-to customer 2 differs from customer
 *    1, and WWI City ID is customer 1's delivery city (10)
 *  - invoice 2: in the window, but its bill-to customer does not exist (dropped by the inner join to bt)
 *  - invoice 3: invoice and line modified exactly at @LastCutoff (excluded)
 *  - invoice 4: modified exactly at @NewCutoff (included); ConfirmedDeliveryTime 23:59:59.999999 is still that date
 *  - invoice 5: the invoice is older than the window, its line 1 µs after @LastCutoff (included)
 */
function saleUpdatesCase(): FixedCase {
  const inv = (id: number, billTo: number, edited: string, delivered: string | null = null): Row =>
    ({ InvoiceID: id, CustomerID: 1, BillToCustomerID: billTo, SalespersonPersonID: 3, InvoiceDate: "2020-06-14", ConfirmedDeliveryTime: delivered, LastEditedWhen: edited });
  const line = (id: number, invoice: number, item: number, edited: string, over: Row = {}): Row => ({
    InvoiceLineID: id, InvoiceID: invoice, StockItemID: item, Description: `item ${id}`, PackageTypeID: 1, Quantity: 4,
    UnitPrice: "2.50", TaxRate: "15.000", TaxAmount: "1.50", LineProfit: "3.00", ExtendedPrice: "10.00", LastEditedWhen: edited, ...over,
  });
  return {
    label: "dry and chiller lines split Quantity; Total Excluding Tax = ExtendedPrice - TaxAmount; UnitPrice and delivery time NULL kept; city from the customer, not the bill-to; a missing bill-to customer drops the invoice; window edges to the microsecond; a line newer than its invoice counts",
    cutoffs: WINDOW,
    tables: {
      "Sales.Invoices": [inv(1, 2, IN_WINDOW_1), inv(2, 99, IN_WINDOW_1), inv(3, 2, AT_LAST), inv(4, 1, AT_NEW, "2020-06-15T23:59:59.999999"), inv(5, 1, BEFORE)],
      "Sales.InvoiceLines": [
        line(1, 1, 1, IN_WINDOW_1, { Description: "dry item " }),
        line(2, 1, 2, IN_WINDOW_2, { UnitPrice: null }),
        line(3, 2, 1, IN_WINDOW_1),
        line(4, 3, 1, AT_LAST),
        line(5, 4, 1, BEFORE),
        line(6, 5, 2, JUST_AFTER_LAST),
      ],
      "Warehouse.StockItems": [{ StockItemID: 1, IsChillerStock: 0 }, { StockItemID: 2, IsChillerStock: 1 }],
      "Warehouse.PackageTypes": [{ PackageTypeID: 1, PackageTypeName: "Each" }],
      "Sales.Customers": [{ CustomerID: 1, DeliveryCityID: 10 }, { CustomerID: 2, DeliveryCityID: 20 }],
    },
  };
}

/**
 * Integration.GetStockHoldingUpdates (hand-derived; no window). Expected: every holding, 3 rows.
 *  - BinLocation '' (kept, not NULL) and one with a trailing space; QuantityOnHand 0 and negative; LastCostPrice 0.01 and
 *    0.00; ReorderLevel and TargetStockLevel different, so a swap is visible
 */
function stockHoldingCase(): FixedCase {
  const h = (id: number, qty: number, bin: string, cost: string, reorder: number, target: number): Row =>
    ({ StockItemID: id, QuantityOnHand: qty, BinLocation: bin, LastStocktakeQuantity: qty + 1, LastCostPrice: cost, ReorderLevel: reorder, TargetStockLevel: target });
  return {
    label: "every holding is listed: empty and trailing-space bin locations kept, zero and negative quantities, cost prices to 2 places, reorder and target levels not swapped",
    tables: { "Warehouse.StockItemHoldings": [h(3, 0, "", "0.01", 5, 50), h(1, -2, "L-1 ", "12345.67", 10, 100), h(2, 7, "A-1", "0.00", 0, 1)] },
  };
}

/**
 * Integration.GetTransactionUpdates (hand-derived). UNION ALL of customer and supplier transactions. Expected: 6 rows.
 *  - customer transaction 1: no invoice (InvoiceID NULL): WWI Customer ID falls back to the transaction's customer
 *  - customer transaction 2: an invoice for customer 8 while the transaction is for customer 5: WWI Customer ID = 8,
 *    WWI Bill To Customer ID = 5
 *  - customer transaction 3: an InvoiceID with no invoice row (the LEFT JOIN keeps it; falls back to customer 5)
 *  - customer transaction 4: exactly at @LastCutoff (excluded); 5: exactly at @NewCutoff (included); IsFinalized NULL
 *  - supplier transaction 1: SupplierInvoiceNumber '' (kept, not NULL), PurchaseOrderID NULL, a negative balance;
 *    supplier transaction 2: 1 µs after @LastCutoff (included); 3: 1 µs after @NewCutoff (excluded)
 */
function transactionUpdatesCase(): FixedCase {
  const ct = (id: number, customer: number, invoice: number | null, edited: string, fin: number | null = 1): Row => ({
    CustomerTransactionID: id, CustomerID: customer, TransactionTypeID: 1, InvoiceID: invoice, PaymentMethodID: null, TransactionDate: "2020-06-15",
    AmountExcludingTax: "100.00", TaxAmount: "15.00", TransactionAmount: "115.00", OutstandingBalance: "0.00", IsFinalized: fin, LastEditedWhen: edited,
  });
  const st = (id: number, number: string | null, po: number | null, edited: string, balance = "0.00"): Row => ({
    SupplierTransactionID: id, SupplierID: 4, TransactionTypeID: 5, PurchaseOrderID: po, PaymentMethodID: 2, SupplierInvoiceNumber: number,
    TransactionDate: "2020-06-15", AmountExcludingTax: "-50.00", TaxAmount: "-7.50", TransactionAmount: "-57.50", OutstandingBalance: balance, IsFinalized: 0, LastEditedWhen: edited,
  });
  return {
    label: "customer id from the invoice when there is one, else from the transaction (no invoice, or an InvoiceID with no invoice row); supplier rows have NULL customer columns; '' invoice number kept; window edges to the microsecond on both halves",
    cutoffs: WINDOW,
    tables: {
      "Sales.CustomerTransactions": [ct(1, 5, null, IN_WINDOW_1), ct(2, 5, 1, IN_WINDOW_1), ct(3, 5, 99, IN_WINDOW_2), ct(4, 5, null, AT_LAST), ct(5, 5, null, AT_NEW, null)],
      "Sales.Invoices": [{ InvoiceID: 1, CustomerID: 8 }],
      "Purchasing.SupplierTransactions": [st(1, "", null, IN_WINDOW_1, "-57.50"), st(2, "INV-2", 3, JUST_AFTER_LAST), st(3, "INV-3", 3, JUST_AFTER_NEW)],
    },
  };
}

// ── views over reference data (Website.Customers / Website.Suppliers) ──────────────────────────
const geography = { kind: "geography" } as const;
const people: TableSpec = { schema: "Application", name: "People", columns: [pk("PersonID"), col("FullName", nv(50))] };
const deliveryMethods: TableSpec = { schema: "Application", name: "DeliveryMethods", columns: [pk("DeliveryMethodID"), col("DeliveryMethodName", nv(50))] };
const cities: TableSpec = { schema: "Application", name: "Cities", columns: [pk("CityID"), col("CityName", nv(50))] };

/**
 * Website.Customers (hand-derived). Every join is a LEFT JOIN, so every customer is listed: expected 3 rows.
 *  - customer 1: every reference present; a different alternate contact; no buying group (NULL); DeliveryLocation
 *    POINT(-122.25 47.5) (binary-exact coordinates, so neither engine rounds them in the text); DeliveryRun '' (kept,
 *    not NULL), RunPosition NULL
 *  - customer 2: category, primary contact, delivery method and city all point at missing rows (each NULL); no location
 *  - customer 3: the same person as primary and alternate contact (both joins find the row); a buying group;
 *    POINT(0.5 -1.75); a trailing space in the customer name (kept)
 */
function websiteCustomersCase(): FixedCase {
  const c = (id: number, over: Row): Row => ({
    CustomerID: id, CustomerName: `Customer ${id}`, CustomerCategoryID: 1, PrimaryContactPersonID: 1, AlternateContactPersonID: null,
    BuyingGroupID: null, DeliveryMethodID: 1, DeliveryCityID: 1, PhoneNumber: "(206) 555-0100", FaxNumber: "(206) 555-0101",
    WebsiteURL: `http://c${id}.example.com`, DeliveryLocation: null, DeliveryRun: null, RunPosition: null, ...over,
  });
  return {
    label: "LEFT JOINs keep every customer: missing category, contact, method or city give NULL; same person as both contacts; geography as WKT; '' and NULL kept apart",
    tables: {
      "Sales.Customers": [
        c(1, { AlternateContactPersonID: 2, DeliveryLocation: "POINT(-122.25 47.5)", DeliveryRun: "" }),
        c(2, { CustomerCategoryID: 99, PrimaryContactPersonID: 99, DeliveryMethodID: 99, DeliveryCityID: 99 }),
        c(3, { CustomerName: "Customer 3 ", AlternateContactPersonID: 1, BuyingGroupID: 1, DeliveryLocation: "POINT(0.5 -1.75)", RunPosition: "7" }),
      ],
      "Sales.CustomerCategories": [{ CustomerCategoryID: 1, CustomerCategoryName: "Novelty Shop" }],
      "Sales.BuyingGroups": [{ BuyingGroupID: 1, BuyingGroupName: "Tailspin Toys" }],
      "Application.People": [{ PersonID: 1, FullName: "Ann Lee" }, { PersonID: 2, FullName: "Bo Ng" }],
      "Application.DeliveryMethods": [{ DeliveryMethodID: 1, DeliveryMethodName: "Delivery Van" }],
      "Application.Cities": [{ CityID: 1, CityName: "Seattle" }],
    },
  };
}

/**
 * Website.Suppliers (hand-derived). Every join is a LEFT JOIN: expected 3 rows.
 *  - supplier 1: every reference present; DeliveryMethodID NULL (DeliveryMethod NULL); POINT(-0.25 51.5); SupplierReference ''
 *  - supplier 2: category, both contacts and city point at missing rows (NULL); no location; SupplierReference NULL
 *  - supplier 3: the same person as primary and alternate contact; a delivery method; POINT(174.75 -36.75)
 */
function websiteSuppliersCase(): FixedCase {
  const s = (id: number, over: Row): Row => ({
    SupplierID: id, SupplierName: `Supplier ${id}`, SupplierCategoryID: 1, PrimaryContactPersonID: 1, AlternateContactPersonID: 2,
    DeliveryMethodID: null, DeliveryCityID: 1, SupplierReference: null, PhoneNumber: "(415) 555-0100", FaxNumber: "(415) 555-0101",
    WebsiteURL: `http://s${id}.example.com`, DeliveryLocation: null, ...over,
  });
  return {
    label: "LEFT JOINs keep every supplier: missing category, contacts or city, and a NULL delivery method, give NULL; same person as both contacts; geography as WKT; '' and NULL kept apart",
    tables: {
      "Purchasing.Suppliers": [
        s(1, { DeliveryLocation: "POINT(-0.25 51.5)", SupplierReference: "" }),
        s(2, { SupplierCategoryID: 99, PrimaryContactPersonID: 98, AlternateContactPersonID: 99, DeliveryCityID: 99 }),
        s(3, { AlternateContactPersonID: 1, DeliveryMethodID: 1, DeliveryLocation: "POINT(174.75 -36.75)", SupplierReference: "REF-3" }),
      ],
      "Purchasing.SupplierCategories": [{ SupplierCategoryID: 1, SupplierCategoryName: "Toy Supplier" }],
      "Application.People": [{ PersonID: 1, FullName: "Ann Lee" }, { PersonID: 2, FullName: "Bo Ng" }],
      "Application.DeliveryMethods": [{ DeliveryMethodID: 1, DeliveryMethodName: "Air Freight" }],
      "Application.Cities": [{ CityID: 1, CityName: "Auckland" }],
    },
  };
}

SPECS.push(
  {
    ...base, schema: "Website", name: "Customers", objectClass: "view", windowParams: false, orderKey: [],
    pgFunction: "website.customers",
    tables: [
      { schema: "Sales", name: "Customers", columns: [
        pk("CustomerID"), col("CustomerName", nv(100)), ref("CustomerCategoryID"), ref("PrimaryContactPersonID"),
        ref("AlternateContactPersonID", true), ref("BuyingGroupID", true), ref("DeliveryMethodID"), ref("DeliveryCityID"),
        col("PhoneNumber", nv(20)), col("FaxNumber", nv(20)), col("WebsiteURL", nv(256)),
        col("DeliveryLocation", geography, true), col("DeliveryRun", nv(5), true), col("RunPosition", nv(5), true) ] },
      { schema: "Sales", name: "CustomerCategories", columns: [pk("CustomerCategoryID"), col("CustomerCategoryName", nv(50))] },
      { schema: "Sales", name: "BuyingGroups", columns: [pk("BuyingGroupID"), col("BuyingGroupName", nv(50))] },
      people, deliveryMethods, cities,
    ],
    // DeliveryLocation is compared as well-known text (STAsText / ST_AsText) so the geography values themselves are checked
    ssCall: "SELECT CustomerID, CustomerName, CustomerCategoryName, PrimaryContact, AlternateContact, PhoneNumber, FaxNumber, BuyingGroupName, WebsiteURL, DeliveryMethod, CityName, DeliveryLocation.STAsText() AS DeliveryLocation, DeliveryRun, RunPosition FROM Website.Customers",
    pgCall: 'SELECT "CustomerID", "CustomerName", "CustomerCategoryName", "PrimaryContact", "AlternateContact", "PhoneNumber", "FaxNumber", "BuyingGroupName", "WebsiteURL", "DeliveryMethod", "CityName", ST_AsText("DeliveryLocation") AS "DeliveryLocation", "DeliveryRun", "RunPosition" FROM {fn}',
    mutants: [
      { name: "alternate contact joined on the primary contact id", from: 'ON s."AlternateContactPersonID" = ap."PersonID"', to: 'ON s."PrimaryContactPersonID" = ap."PersonID"' },
      { name: "buying group LEFT JOIN becomes INNER JOIN", from: "LEFT OUTER JOIN sales.buying_groups", to: "INNER JOIN sales.buying_groups" },
    ],
    fixedCases: [websiteCustomersCase()],
  },
  {
    ...base, schema: "Website", name: "Suppliers", objectClass: "view", windowParams: false, orderKey: [],
    pgFunction: "website.suppliers",
    tables: [
      { schema: "Purchasing", name: "Suppliers", columns: [
        pk("SupplierID"), col("SupplierName", nv(100)), ref("SupplierCategoryID"), ref("PrimaryContactPersonID"),
        ref("AlternateContactPersonID"), ref("DeliveryMethodID", true), ref("DeliveryCityID"),
        col("SupplierReference", nv(20), true), col("PhoneNumber", nv(20)), col("FaxNumber", nv(20)),
        col("WebsiteURL", nv(256)), col("DeliveryLocation", geography, true) ] },
      { schema: "Purchasing", name: "SupplierCategories", columns: [pk("SupplierCategoryID"), col("SupplierCategoryName", nv(50))] },
      people, deliveryMethods, cities,
    ],
    ssCall: "SELECT SupplierID, SupplierName, SupplierCategoryName, PrimaryContact, AlternateContact, PhoneNumber, FaxNumber, WebsiteURL, DeliveryMethod, CityName, DeliveryLocation.STAsText() AS DeliveryLocation, SupplierReference FROM Website.Suppliers",
    pgCall: 'SELECT "SupplierID", "SupplierName", "SupplierCategoryName", "PrimaryContact", "AlternateContact", "PhoneNumber", "FaxNumber", "WebsiteURL", "DeliveryMethod", "CityName", ST_AsText("DeliveryLocation") AS "DeliveryLocation", "SupplierReference" FROM {fn}',
    mutants: [
      { name: "alternate contact joined on the primary contact id", from: 'ON s."AlternateContactPersonID" = ap."PersonID"', to: 'ON s."PrimaryContactPersonID" = ap."PersonID"' },
      { name: "delivery method LEFT JOIN becomes INNER JOIN", from: "LEFT OUTER JOIN application.delivery_methods", to: "INNER JOIN application.delivery_methods" },
    ],
    fixedCases: [websiteSuppliersCase()],
  },
  {
    ...base, schema: "Website", name: "CalculateCustomerPrice", objectClass: "function", windowParams: false, orderKey: [],
    pgFunction: "website.calculate_customer_price",
    params: [ref("CustomerID"), ref("StockItemID"), col("PricingDate", date)],
    ssCall: "SELECT Website.CalculateCustomerPrice(?, ?, ?) AS result",
    pgCall: "SELECT {fn}($1::integer, $2::integer, $3::date) AS result",
    // runtime: one call per customer row (volume rows) inside a single statement, so execution time is the database's
    // Each call scans special deals and, per deal, the stock-group table (no secondary indexes in the scratch tables),
    // so cost is quadratic in volume. 1,000 rows per table and 100 calls keeps the run to seconds.
    benchVolume: 1000,
    benchSs: "SELECT SUM(Website.CalculateCustomerPrice(c.CustomerID, c.CustomerID, CAST('2020-01-02' AS date))) AS total FROM Sales.Customers AS c WHERE c.CustomerID <= 100",
    benchPg: "SELECT SUM({fn}(c.\"CustomerID\", c.\"CustomerID\", DATE '2020-01-02')) AS total FROM sales.customers AS c WHERE c.\"CustomerID\" <= 100",
    tables: [
      { schema: "Sales", name: "Customers", columns: [pk("CustomerID"), ref("BuyingGroupID", true), ref("CustomerCategoryID")] },
      { schema: "Warehouse", name: "StockItems", columns: [pk("StockItemID"), col("UnitPrice", dec(18, 2))] },
      { schema: "Sales", name: "SpecialDeals", columns: [
        pk("SpecialDealID"), ref("StockItemID", true), ref("CustomerID", true), ref("BuyingGroupID", true),
        ref("CustomerCategoryID", true), ref("StockGroupID", true), col("StartDate", date), col("EndDate", date),
        col("DiscountAmount", dec(18, 2), true), col("DiscountPercentage", dec(18, 3), true), col("UnitPrice", dec(18, 2), true) ] },
      { schema: "Warehouse", name: "StockItemStockGroups", columns: [pk("StockItemStockGroupID"), ref("StockItemID"), ref("StockGroupID")] },
    ],
    fixedCases: [{
      label: "percentage discount price: 19.99 * 12.5 / 100 = 2.49875 rounds to 2.50",
      args: [1, 1, "2020-01-02"],
      tables: {
        "Sales.Customers": [{ CustomerID: 1, BuyingGroupID: null, CustomerCategoryID: 1 }],
        "Warehouse.StockItems": [{ StockItemID: 1, UnitPrice: "19.99" }],
        "Sales.SpecialDeals": [{ SpecialDealID: 1, StockItemID: 1, CustomerID: null, BuyingGroupID: null, CustomerCategoryID: null, StockGroupID: null, StartDate: "2020-01-01", EndDate: "2020-01-03", DiscountAmount: null, DiscountPercentage: "12.500", UnitPrice: null }],
        "Warehouse.StockItemStockGroups": [],
      },
    }, {
      label: "pricing date equals the deal's end date: BETWEEN is inclusive, so the special price 5.00 applies",
      args: [1, 1, "2020-01-02"],
      tables: {
        "Sales.Customers": [{ CustomerID: 1, BuyingGroupID: null, CustomerCategoryID: 1 }],
        "Warehouse.StockItems": [{ StockItemID: 1, UnitPrice: "10.00" }],
        "Sales.SpecialDeals": [{ SpecialDealID: 1, StockItemID: 1, CustomerID: null, BuyingGroupID: null, CustomerCategoryID: null, StockGroupID: null, StartDate: "2020-01-01", EndDate: "2020-01-02", DiscountAmount: null, DiscountPercentage: null, UnitPrice: "5.00" }],
        "Warehouse.StockItemStockGroups": [],
      },
    }, {
      label: "two competing discount amounts: the highest (25.00) must win, giving 75.00",
      args: [1, 1, "2020-01-02"],
      tables: {
        "Sales.Customers": [{ CustomerID: 1, BuyingGroupID: null, CustomerCategoryID: 1 }],
        "Warehouse.StockItems": [{ StockItemID: 1, UnitPrice: "100.00" }],
        "Sales.SpecialDeals": [
          { SpecialDealID: 1, StockItemID: 1, CustomerID: null, BuyingGroupID: null, CustomerCategoryID: null, StockGroupID: null, StartDate: "2020-01-01", EndDate: "2020-01-03", DiscountAmount: "10.00", DiscountPercentage: null, UnitPrice: null },
          { SpecialDealID: 2, StockItemID: null, CustomerID: 1, BuyingGroupID: null, CustomerCategoryID: null, StockGroupID: null, StartDate: "2020-01-01", EndDate: "2020-01-03", DiscountAmount: "25.00", DiscountPercentage: null, UnitPrice: null },
        ],
        "Warehouse.StockItemStockGroups": [],
      },
    }],
    mutants: [
      { name: "deal end date exclusive", from: 'pricing_date BETWEEN sd."StartDate" AND sd."EndDate"', to: 'pricing_date >= sd."StartDate" AND pricing_date < sd."EndDate"' },
      { name: "lowest discount amount instead of highest", from: 'MAX(sd."DiscountAmount")', to: 'MIN(sd."DiscountAmount")' },
      { name: "percentage price truncates instead of rounding", from: 'round(unit_price * highest_discount_percentage / 100.0, 2)', to: 'trunc(unit_price * highest_discount_percentage / 100.0, 2)' },
    ],
    notes: ["WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.", "Scalar function: coverage counts samples where the result is not NULL."],
  }
);

SPECS.push(...SEARCH_SPECS, ...LOGON_SPECS, ...SEQUENCE_SPECS, ...VEHICLE_SPECS, ...COLDROOM_SPECS, ...ORDER_SPECS, ...INVOICE_SPECS, ...AW_SPECS, ...AW_VIEWS, ...AW2_SPECS);

export const specByName = (qualified: string): ObjectSpec | undefined =>
  SPECS.find((s) => `${s.schema}.${s.name}` === qualified);
