-- PL/pgSQL equivalent of Integration.GetMovementUpdates (WideWorldImporters).
-- Source definition MEASURED 2026-11-06 from sys.sql_modules on restored WideWorldImporters.
-- Hand-written conversion; engine = "hand-written".
--
-- Conversion notes:
--   1. WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.
--   2. Output column names preserve the original aliases including spaces,
--      using double-quoted identifiers in the RETURNS TABLE clause.
--   3. CAST(sit.Quantity AS int) in T-SQL truncates toward zero.
--      PostgreSQL CAST(... AS integer) also truncates toward zero — they match.
--      The naive version (03-naive-function.sql) uses ::int which rounds — wrong.
--   4. CAST(sit.TransactionOccurredWhen AS date): SQL Server date; mapped to ::date in PG.
--   5. datetime2(7) filter/value columns: sub-microsecond ticks truncated by PG timestamp.

CREATE OR REPLACE FUNCTION integration.get_movement_updates(
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
        CAST(TRUNC(sit."Quantity") AS integer),   -- truncate toward zero, matching T-SQL CAST(decimal AS int)
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
