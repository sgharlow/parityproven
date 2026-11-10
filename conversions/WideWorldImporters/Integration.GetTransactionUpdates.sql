-- PL/pgSQL conversion of Integration.GetTransactionUpdates (WideWorldImporters).
-- Engine: Kiro first draft (see pair record).
-- WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.
-- The source has no ORDER BY, so none is added.

CREATE OR REPLACE FUNCTION integration.get_transaction_updates(
    last_cutoff timestamp,
    new_cutoff  timestamp
)
RETURNS TABLE (
    "Date Key"                       date,
    "WWI Customer Transaction ID"    integer,
    "WWI Supplier Transaction ID"    integer,
    "WWI Invoice ID"                 integer,
    "WWI Purchase Order ID"          integer,
    "Supplier Invoice Number"        varchar(20),
    "Total Excluding Tax"            numeric,
    "Tax Amount"                     numeric,
    "Total Including Tax"            numeric,
    "Outstanding Balance"            numeric,
    "Is Finalized"                   boolean,
    "WWI Customer ID"                integer,
    "WWI Bill To Customer ID"        integer,
    "WWI Supplier ID"                integer,
    "WWI Transaction Type ID"        integer,
    "WWI Payment Method ID"          integer,
    "Last Modified When"             timestamp
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        ct."TransactionDate"::date,
        ct."CustomerTransactionID",
        NULL::integer,
        ct."InvoiceID",
        NULL::integer,
        NULL::varchar(20),
        ct."AmountExcludingTax",
        ct."TaxAmount",
        ct."TransactionAmount",
        ct."OutstandingBalance",
        ct."IsFinalized",
        COALESCE(i."CustomerID", ct."CustomerID"),
        ct."CustomerID",
        NULL::integer,
        ct."TransactionTypeID",
        ct."PaymentMethodID",
        ct."LastEditedWhen"
    FROM sales.customer_transactions AS ct
    LEFT OUTER JOIN sales.invoices AS i ON ct."InvoiceID" = i."InvoiceID"
    WHERE ct."LastEditedWhen" > last_cutoff
      AND ct."LastEditedWhen" <= new_cutoff
    UNION ALL
    SELECT
        st."TransactionDate"::date,
        NULL::integer,
        st."SupplierTransactionID",
        NULL::integer,
        st."PurchaseOrderID",
        st."SupplierInvoiceNumber",
        st."AmountExcludingTax",
        st."TaxAmount",
        st."TransactionAmount",
        st."OutstandingBalance",
        st."IsFinalized",
        NULL::integer,
        NULL::integer,
        st."SupplierID",
        st."TransactionTypeID",
        st."PaymentMethodID",
        st."LastEditedWhen"
    FROM purchasing.supplier_transactions AS st
    WHERE st."LastEditedWhen" > last_cutoff
      AND st."LastEditedWhen" <= new_cutoff
$$;
