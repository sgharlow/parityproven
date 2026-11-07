-- PostgreSQL DDL for the harness-mvp spec.
-- Column-type mapping from SQL Server to PostgreSQL (MEASURED from live WideWorldImporters restore):
--
--   SQL Server type          PostgreSQL type       Notes
--   ----------------------   -------------------   ----------------------------------------
--   int NOT NULL             integer NOT NULL
--   int NULL                 integer               NULL allowed
--   decimal(18,3) NOT NULL   numeric(18,3)         (scale confirmed from sys.columns)
--   datetime2(7)             timestamp             100ns ticks truncated to microseconds on
--                                                  insert; load-time findings recorded when
--                                                  sub-microsecond values are detected
--
-- Actual schema MEASURED 2026-11-06 from sys.columns on restored WideWorldImporters:
--   StockItemTransactionID, StockItemID, TransactionTypeID, CustomerID, InvoiceID,
--   SupplierID, PurchaseOrderID, TransactionOccurredWhen, Quantity, LastEditedBy, LastEditedWhen

CREATE SCHEMA IF NOT EXISTS warehouse;
CREATE SCHEMA IF NOT EXISTS integration;

CREATE TABLE IF NOT EXISTS warehouse.stock_item_transactions (
    "StockItemTransactionID"  integer       NOT NULL,
    "StockItemID"             integer       NOT NULL,
    "TransactionTypeID"       integer       NOT NULL,
    "CustomerID"              integer,
    "InvoiceID"               integer,
    "SupplierID"              integer,
    "PurchaseOrderID"         integer,
    "TransactionOccurredWhen" timestamp     NOT NULL,
    "Quantity"                numeric(18,3) NOT NULL,
    "LastEditedBy"            integer       NOT NULL,
    "LastEditedWhen"          timestamp     NOT NULL,
    CONSTRAINT pk_stock_item_transactions PRIMARY KEY ("StockItemTransactionID")
);
