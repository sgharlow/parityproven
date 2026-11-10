/**
 * Object specs for the conversion loop. Column lists were derived from the T-SQL definitions
 * (sys.sql_modules) and types from INFORMATION_SCHEMA.COLUMNS on the restored WideWorldImporters.
 * Only columns the procedure references are declared.
 */

import type { ColSpec, ObjectSpec, TableSpec } from "../harness/generic/spec.js";

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
    fixedCases: [{
      label: "fractional Quantity (decimal -> int cast)", cutoffs: WINDOW,
      tables: { "Warehouse.StockItemTransactions": [2.5, -2.5, 0.999].map((q, i) => ({
        StockItemTransactionID: i + 1, StockItemID: 1, TransactionTypeID: 1, CustomerID: null,
        InvoiceID: null, SupplierID: null, PurchaseOrderID: null,
        TransactionOccurredWhen: IN_WINDOW_1, Quantity: q.toFixed(3), LastEditedWhen: IN_WINDOW_2,
      })) },
    }],
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
    }],
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
  },
];

// ── views over reference data (Website.Customers / Website.Suppliers) ──────────────────────────
const geography = { kind: "geography" } as const;
const people: TableSpec = { schema: "Application", name: "People", columns: [pk("PersonID"), col("FullName", nv(50))] };
const deliveryMethods: TableSpec = { schema: "Application", name: "DeliveryMethods", columns: [pk("DeliveryMethodID"), col("DeliveryMethodName", nv(50))] };
const cities: TableSpec = { schema: "Application", name: "Cities", columns: [pk("CityID"), col("CityName", nv(50))] };

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
  },
  {
    ...base, schema: "Website", name: "CalculateCustomerPrice", objectClass: "function", windowParams: false, orderKey: [],
    pgFunction: "website.calculate_customer_price",
    params: [ref("CustomerID"), ref("StockItemID"), col("PricingDate", date)],
    ssCall: "SELECT Website.CalculateCustomerPrice(?, ?, ?) AS result",
    pgCall: "SELECT {fn}($1::integer, $2::integer, $3::date) AS result",
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

export const specByName = (qualified: string): ObjectSpec | undefined =>
  SPECS.find((s) => `${s.schema}.${s.name}` === qualified);
