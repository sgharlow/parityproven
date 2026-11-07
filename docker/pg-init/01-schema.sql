-- PostgreSQL DDL for the harness-mvp spec.
-- Column-type mapping from SQL Server to PostgreSQL:
--
--   SQL Server type          PostgreSQL type       Notes
--   ----------------------   -------------------   ----------------------------------------
--   int NOT NULL             integer NOT NULL
--   int NULL                 integer               NULL allowed; no explicit NOT NULL
--   nvarchar(20) NULL        varchar(20)           Unicode stored as UTF-8 natively in PG
--   decimal(18,3) NOT NULL   numeric(18,3)
--   datetime2(7)             timestamp             100ns ticks truncated to microseconds on
--                                                  insert; load-time findings recorded when
--                                                  sub-microsecond values are detected

CREATE SCHEMA IF NOT EXISTS warehouse;
CREATE SCHEMA IF NOT EXISTS integration;

CREATE TABLE IF NOT EXISTS warehouse.stock_item_transactions (
    "StockItemTransactionID"  integer       NOT NULL,
    "StockItemID"             integer       NOT NULL,
    "TransactionTypeID"       integer       NOT NULL,
    "InvoiceID"               integer,
    "SupplierInvoiceNumber"   varchar(20),
    "CustomerID"              integer,
    "PurchaseOrderID"         integer,
    "Quantity"                numeric(18,3) NOT NULL,
    "LastEditedBy"            integer       NOT NULL,
    "LastEditedWhen"          timestamp     NOT NULL,
    CONSTRAINT pk_stock_item_transactions PRIMARY KEY ("StockItemTransactionID")
);
