-- Final PL/pgSQL conversion of Integration.GetMovementUpdates.
-- Source: WideWorldImporters-Full.bak, release wide-world-importers-v1.0 (MIT).
-- Source definition MEASURED 2026-11-06 from sys.sql_modules on restored WideWorldImporters.
-- Engine: hand-written.
--
-- Conversion notes:
--   1. WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.
--   2. Output column names preserve original aliases (spaces included) as double-quoted identifiers.
--   3. CAST(Quantity AS int): T-SQL truncates toward zero; PostgreSQL TRUNC() + CAST also truncates.
--      The naive version uses ::int which rounds — wrong.
--   4. CAST(TransactionOccurredWhen AS date): mapped to ::date in PostgreSQL.
--   5. datetime2(7) sub-microsecond values are truncated to microseconds by PostgreSQL timestamp.

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
        sit."Quantity"::integer,
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
