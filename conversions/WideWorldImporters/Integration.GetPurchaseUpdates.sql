-- PL/pgSQL conversion of Integration.GetPurchaseUpdates (WideWorldImporters).
-- Engine: Kiro first draft (see pair record).
-- WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.

CREATE OR REPLACE FUNCTION integration.get_purchase_updates(
    last_cutoff timestamp,
    new_cutoff  timestamp
)
RETURNS TABLE (
    "Date Key"              date,
    "WWI Purchase Order ID" integer,
    "Ordered Outers"        integer,
    "Ordered Quantity"      integer,
    "Received Outers"       integer,
    "Package"               varchar(50),
    "Is Order Finalized"    boolean,
    "WWI Supplier ID"       integer,
    "WWI Stock Item ID"     integer,
    "Last Modified When"    timestamp
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        po."OrderDate"::date,
        po."PurchaseOrderID",
        pol."OrderedOuters",
        pol."OrderedOuters" * si."QuantityPerOuter",
        pol."ReceivedOuters",
        pt."PackageTypeName",
        pol."IsOrderLineFinalized",
        po."SupplierID",
        pol."StockItemID",
        CASE WHEN pol."LastEditedWhen" > po."LastEditedWhen" THEN pol."LastEditedWhen" ELSE po."LastEditedWhen" END
    FROM purchasing.purchase_orders AS po
    INNER JOIN purchasing.purchase_order_lines AS pol ON po."PurchaseOrderID" = pol."PurchaseOrderID"
    INNER JOIN warehouse.stock_items AS si ON pol."StockItemID" = si."StockItemID"
    INNER JOIN warehouse.package_types AS pt ON pol."PackageTypeID" = pt."PackageTypeID"
    WHERE CASE WHEN pol."LastEditedWhen" > po."LastEditedWhen" THEN pol."LastEditedWhen" ELSE po."LastEditedWhen" END > last_cutoff
      AND CASE WHEN pol."LastEditedWhen" > po."LastEditedWhen" THEN pol."LastEditedWhen" ELSE po."LastEditedWhen" END <= new_cutoff
    ORDER BY po."PurchaseOrderID"
$$;
