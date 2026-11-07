-- PLANTED DEFECT — do not use in production.
-- This is the naive conversion used by the defect check in the harness.
-- It uses ::int (which rounds) instead of CAST(TRUNC(...) AS integer) (which truncates).
-- For Quantity = 2.5: TRUNC gives 2 (correct, matches T-SQL); ::int rounds to 3 (wrong).
-- The property-based test MUST report this as FAILING before the correct conversion is trusted.

CREATE OR REPLACE FUNCTION integration.get_movement_updates_naive(
    last_cutoff timestamp,
    new_cutoff  timestamp
)
RETURNS TABLE (
    "WWI Stock Item Transaction ID" integer,
    "WWI Stock Item ID"             integer,
    "WWI Transaction Type ID"       integer,
    "WWI Invoice ID"                integer,
    "Supplier Invoice Number"       varchar(20),
    "WWI Customer ID"               integer,
    "WWI Purchase Order ID"         integer,
    "Quantity"                      integer,
    "Last Edited When"              timestamp
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        sit."StockItemTransactionID"::integer,
        sit."StockItemID"::integer,
        sit."TransactionTypeID"::integer,
        sit."InvoiceID",
        sit."SupplierInvoiceNumber",
        sit."CustomerID",
        sit."PurchaseOrderID",
        sit."Quantity"::integer,   -- BUG: rounds instead of truncating toward zero
        sit."LastEditedWhen"
    FROM warehouse.stock_item_transactions sit
    WHERE sit."LastEditedWhen" > last_cutoff
      AND sit."LastEditedWhen" <= new_cutoff
    ORDER BY sit."StockItemTransactionID"
$$;
