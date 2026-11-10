-- PL/pgSQL conversion of Integration.GetSaleUpdates (WideWorldImporters).
-- Engine: Kiro first draft (see pair record).
-- WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.
-- Output column "WWI Saleperson ID" keeps the source's spelling.

CREATE OR REPLACE FUNCTION integration.get_sale_updates(
    last_cutoff timestamp,
    new_cutoff  timestamp
)
RETURNS TABLE (
    "Invoice Date Key"        date,
    "Delivery Date Key"       date,
    "WWI Invoice ID"          integer,
    "Description"             varchar(100),
    "Package"                 varchar(50),
    "Quantity"                integer,
    "Unit Price"              numeric,
    "Tax Rate"                numeric,
    "Total Excluding Tax"     numeric,
    "Tax Amount"              numeric,
    "Profit"                  numeric,
    "Total Including Tax"     numeric,
    "Total Dry Items"         integer,
    "Total Chiller Items"     integer,
    "WWI City ID"             integer,
    "WWI Customer ID"         integer,
    "WWI Bill To Customer ID" integer,
    "WWI Stock Item ID"       integer,
    "WWI Saleperson ID"       integer,
    "Last Modified When"      timestamp
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        i."InvoiceDate"::date,
        i."ConfirmedDeliveryTime"::date,
        i."InvoiceID",
        il."Description",
        pt."PackageTypeName",
        il."Quantity",
        il."UnitPrice",
        il."TaxRate",
        il."ExtendedPrice" - il."TaxAmount",
        il."TaxAmount",
        il."LineProfit",
        il."ExtendedPrice",
        CASE WHEN NOT si."IsChillerStock" THEN il."Quantity" ELSE 0 END,
        CASE WHEN si."IsChillerStock" THEN il."Quantity" ELSE 0 END,
        c."DeliveryCityID",
        i."CustomerID",
        i."BillToCustomerID",
        il."StockItemID",
        i."SalespersonPersonID",
        CASE WHEN il."LastEditedWhen" > i."LastEditedWhen" THEN il."LastEditedWhen" ELSE i."LastEditedWhen" END
    FROM sales.invoices AS i
    INNER JOIN sales.invoice_lines AS il ON i."InvoiceID" = il."InvoiceID"
    INNER JOIN warehouse.stock_items AS si ON il."StockItemID" = si."StockItemID"
    INNER JOIN warehouse.package_types AS pt ON il."PackageTypeID" = pt."PackageTypeID"
    INNER JOIN sales.customers AS c ON i."CustomerID" = c."CustomerID"
    INNER JOIN sales.customers AS bt ON bt."CustomerID" = i."BillToCustomerID"
    WHERE CASE WHEN il."LastEditedWhen" > i."LastEditedWhen" THEN il."LastEditedWhen" ELSE i."LastEditedWhen" END > last_cutoff
      AND CASE WHEN il."LastEditedWhen" > i."LastEditedWhen" THEN il."LastEditedWhen" ELSE i."LastEditedWhen" END <= new_cutoff
    ORDER BY i."InvoiceID", il."InvoiceLineID"
$$;
