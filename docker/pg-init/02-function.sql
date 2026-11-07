-- PL/pgSQL equivalent of Integration.GetMovementUpdates (WideWorldImporters).
-- Hand-written conversion; engineOutput = this file; engine = "hand-written".
--
-- Conversion notes:
--   1. WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.
--      Recorded in the pair record evidence.
--   2. Output column names preserve the original aliases including spaces,
--      using double-quoted identifiers in the RETURNS TABLE clause.
--   3. CAST(sit.Quantity AS int) in T-SQL truncates toward zero.
--      PostgreSQL CAST(... AS integer) also truncates toward zero — they match.
--      (The naive conversion uses ::int which calls round(), not trunc().)
--   4. datetime2(7) parameter precision: sub-microsecond ticks are truncated
--      when stored as timestamp; the harness records this as a load-time finding.

CREATE OR REPLACE FUNCTION integration.get_movement_updates(
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
        CAST(TRUNC(sit."Quantity") AS integer),   -- truncate toward zero, matching T-SQL CAST(decimal AS int)
        sit."LastEditedWhen"
    FROM warehouse.stock_item_transactions sit
    WHERE sit."LastEditedWhen" > last_cutoff
      AND sit."LastEditedWhen" <= new_cutoff
    ORDER BY sit."StockItemTransactionID"
$$;
