-- PL/pgSQL conversion of Integration.GetOrderUpdates (WideWorldImporters).
-- Engine: Kiro first draft (see pair record).
-- WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.

CREATE OR REPLACE FUNCTION integration.get_order_updates(
    last_cutoff timestamp,
    new_cutoff  timestamp
)
RETURNS TABLE (
    "Order Date Key"       date,
    "Picked Date Key"      date,
    "WWI Order ID"         integer,
    "WWI Backorder ID"     integer,
    "Description"          varchar(100),
    "Package"              varchar(50),
    "Quantity"             integer,
    "Unit Price"           numeric,
    "Tax Rate"             numeric,
    "Total Excluding Tax"  numeric,
    "Tax Amount"           numeric,
    "Total Including Tax"  numeric,
    "WWI City ID"          integer,
    "WWI Customer ID"      integer,
    "WWI Stock Item ID"    integer,
    "WWI Salesperson ID"   integer,
    "WWI Picker ID"        integer,
    "Last Modified When"   timestamp
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        o."OrderDate"::date,
        ol."PickingCompletedWhen"::date,
        o."OrderID",
        o."BackorderOrderID",
        ol."Description",
        pt."PackageTypeName",
        ol."Quantity",
        ol."UnitPrice",
        ol."TaxRate",
        round(ol."Quantity" * ol."UnitPrice", 2),
        round(ol."Quantity" * ol."UnitPrice" * ol."TaxRate" / 100.0, 2),
        round(ol."Quantity" * ol."UnitPrice", 2) + round(ol."Quantity" * ol."UnitPrice" * ol."TaxRate" / 100.0, 2),
        c."DeliveryCityID",
        c."CustomerID",
        ol."StockItemID",
        o."SalespersonPersonID",
        o."PickedByPersonID",
        CASE WHEN ol."LastEditedWhen" > o."LastEditedWhen" THEN ol."LastEditedWhen" ELSE o."LastEditedWhen" END
    FROM sales.orders AS o
    INNER JOIN sales.order_lines AS ol ON o."OrderID" = ol."OrderID"
    INNER JOIN warehouse.package_types AS pt ON ol."PackageTypeID" = pt."PackageTypeID"
    INNER JOIN sales.customers AS c ON c."CustomerID" = o."CustomerID"
    WHERE CASE WHEN ol."LastEditedWhen" > o."LastEditedWhen" THEN ol."LastEditedWhen" ELSE o."LastEditedWhen" END > last_cutoff
      AND CASE WHEN ol."LastEditedWhen" > o."LastEditedWhen" THEN ol."LastEditedWhen" ELSE o."LastEditedWhen" END <= new_cutoff
    ORDER BY o."OrderID"
$$;
