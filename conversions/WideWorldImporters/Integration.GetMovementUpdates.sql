-- Final PL/pgSQL conversion of Integration.GetMovementUpdates.
-- Source: WideWorldImporters-Full.bak, release wide-world-importers-v1.0 (MIT).
-- Engine: hand-written.
--
-- Conversion notes:
--   1. WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.
--   2. Output column names preserve original aliases (spaces included) as double-quoted identifiers.
--   3. CAST(Quantity AS int): T-SQL truncates toward zero; PostgreSQL TRUNC() + CAST also truncates.
--      The naive version (Integration.GetMovementUpdates.naive.sql) uses ::int which rounds — wrong.
--   4. datetime2(7) sub-microsecond values are truncated to microseconds by PostgreSQL timestamp.

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
        CAST(TRUNC(sit."Quantity") AS integer),
        sit."LastEditedWhen"
    FROM warehouse.stock_item_transactions sit
    WHERE sit."LastEditedWhen" > last_cutoff
      AND sit."LastEditedWhen" <= new_cutoff
    ORDER BY sit."StockItemTransactionID"
$$;
