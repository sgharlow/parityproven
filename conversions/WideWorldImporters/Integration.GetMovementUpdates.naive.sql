-- PLANTED DEFECT — do not use in production.
-- Uses ::int (rounds) instead of CAST(TRUNC(...) AS integer) (truncates toward zero).
-- For Quantity = 2.5: TRUNC gives 2 (correct, matches T-SQL); ::int rounds to 3 (wrong).
-- The property-based test MUST report this as FAILING before the correct conversion is trusted.

CREATE OR REPLACE FUNCTION integration.get_movement_updates_naive(
    last_cutoff timestamp,
    new_cutoff  timestamp
)
RETURNS TABLE (
    "Date Key"                              date,
    "WWI Stock Item Transaction ID"         integer,
    "WWI Invoice ID"                        integer,
    "WWI Purchase Order ID"                 integer,
    "Quantity"                              integer,
    "WWI Stock Item ID"                     integer,
    "WWI Customer ID"                       integer,
    "WWI Supplier ID"                       integer,
    "WWI Transaction Type ID"               integer,
    "Transaction Occurred When"             timestamp
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        sit."TransactionOccurredWhen"::date,
        sit."StockItemTransactionID"::integer,
        sit."InvoiceID",
        sit."PurchaseOrderID",
        sit."Quantity"::integer,   -- BUG: rounds instead of truncating toward zero
        sit."StockItemID"::integer,
        sit."CustomerID",
        sit."SupplierID",
        sit."TransactionTypeID"::integer,
        sit."TransactionOccurredWhen"
    FROM warehouse.stock_item_transactions sit
    WHERE sit."LastEditedWhen" > last_cutoff
      AND sit."LastEditedWhen" <= new_cutoff
    ORDER BY sit."StockItemTransactionID"
$$;
