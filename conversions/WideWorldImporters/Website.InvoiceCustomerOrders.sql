-- PL/pgSQL conversion of Website.InvoiceCustomerOrders (WideWorldImporters).
-- Engine: Kiro. No separate first draft was kept for this object.
-- WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.
--
-- Differences from a literal translation:
--  * The table-valued parameter type Website.OrderIDList becomes the composite type website.order_id_list and the
--    parameter an array of it; order_id_list_from_json builds it from a JSON array.
--  * The @InvoicesToGenerate table variable becomes a temporary table dropped at commit.
--  * NEXT VALUE FOR -> nextval(); SYSDATETIME() -> localtimestamp.
--  * CONVERT(nvarchar(20), SYSDATETIME(), 126): ISO 8601 text with the fraction omitted on a whole second, cut to 20
--    characters (so it usually ends in '.'). The JSON_MODIFY chain always yields the same text around three values,
--    which is built directly.
--  * TRY/CATCH + XACT_ABORT + THROW -> an exception block that undoes every write and re-raises the same error;
--    THROW 51000 -> RAISE EXCEPTION (SQLSTATE P0001).

CREATE SCHEMA IF NOT EXISTS website;

DO $do$
BEGIN
    CREATE TYPE website.order_id_list AS ("OrderID" integer);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END
$do$;

CREATE OR REPLACE FUNCTION website.order_id_list_from_json(rows jsonb)
RETURNS website.order_id_list[]
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT coalesce(array_agg(jsonb_populate_record(NULL::website.order_id_list, r) ORDER BY ord), '{}')
    FROM jsonb_array_elements(rows) WITH ORDINALITY AS e(r, ord)
$fn$;

CREATE OR REPLACE PROCEDURE website.invoice_customer_orders(
    orders_to_invoice website.order_id_list[],
    packed_by_person_id integer,
    invoiced_by_person_id integer
)
LANGUAGE plpgsql
AS $fn$
DECLARE
    now_ts          timestamp := localtimestamp;
    event_time_full text;
    event_time      text;
BEGIN
    -- CONVERT(nvarchar(20), SYSDATETIME(), 126)
    event_time_full := to_char(now_ts, 'YYYY-MM-DD"T"HH24:MI:SS')
        || CASE WHEN extract(microseconds FROM now_ts)::bigint % 1000000 <> 0 THEN '.' || to_char(now_ts, 'US') ELSE '' END;
    event_time := left(event_time_full, 20);

    BEGIN
        CREATE TEMPORARY TABLE invoices_to_generate
        (
            order_id            integer PRIMARY KEY,
            invoice_id          integer NOT NULL,
            total_dry_items     integer NOT NULL,
            total_chiller_items integer NOT NULL
        ) ON COMMIT DROP;

        -- Check that all orders exist, have been fully picked, and not already invoiced. Also allocate new invoice numbers.
        INSERT INTO pg_temp.invoices_to_generate (order_id, invoice_id, total_dry_items, total_chiller_items)
        SELECT oti."OrderID",
               nextval('sequences."InvoiceID"')::integer,
               COALESCE((SELECT SUM(CASE WHEN si."IsChillerStock" THEN 0 ELSE 1 END)
                         FROM sales.order_lines AS ol
                         INNER JOIN warehouse.stock_items AS si
                         ON ol."StockItemID" = si."StockItemID"
                         WHERE ol."OrderID" = oti."OrderID"), 0),
               COALESCE((SELECT SUM(CASE WHEN si."IsChillerStock" THEN 1 ELSE 0 END)
                         FROM sales.order_lines AS ol
                         INNER JOIN warehouse.stock_items AS si
                         ON ol."StockItemID" = si."StockItemID"
                         WHERE ol."OrderID" = oti."OrderID"), 0)
        FROM unnest(orders_to_invoice) AS oti
        INNER JOIN sales.orders AS o
        ON oti."OrderID" = o."OrderID"
        WHERE NOT EXISTS (SELECT 1 FROM sales.invoices AS i
                                   WHERE i."OrderID" = oti."OrderID")
        AND o."PickingCompletedWhen" IS NOT NULL;

        IF EXISTS (SELECT 1 FROM unnest(orders_to_invoice) AS oti
                   WHERE NOT EXISTS (SELECT 1 FROM pg_temp.invoices_to_generate AS itg WHERE itg.order_id = oti."OrderID")) THEN
            RAISE NOTICE 'At least one order ID either does not exist, is not picked, or is already invoiced';
            RAISE EXCEPTION 'At least one orderID either does not exist, is not picked, or is already invoiced' USING ERRCODE = 'P0001';
        END IF;

        INSERT INTO sales.invoices
            ("InvoiceID", "CustomerID", "BillToCustomerID", "OrderID", "DeliveryMethodID", "ContactPersonID", "AccountsPersonID",
             "SalespersonPersonID", "PackedByPersonID", "InvoiceDate", "CustomerPurchaseOrderNumber",
             "IsCreditNote", "CreditNoteReason", "Comments", "DeliveryInstructions", "InternalComments",
             "TotalDryItems", "TotalChillerItems", "DeliveryRun", "RunPosition",
             "ReturnedDeliveryData",
             "LastEditedBy", "LastEditedWhen")
        SELECT itg.invoice_id, c."CustomerID", c."BillToCustomerID", itg.order_id, c."DeliveryMethodID", o."ContactPersonID", btc."PrimaryContactPersonID",
               o."SalespersonPersonID", packed_by_person_id, now_ts::date, o."CustomerPurchaseOrderNumber",
               false, NULL, NULL, c."DeliveryAddressLine1" || ', ' || c."DeliveryAddressLine2", NULL,
               itg.total_dry_items, itg.total_chiller_items, c."DeliveryRun", c."RunPosition",
               '{"Events": [{ "Event":"Ready for collection","EventTime":"' || event_time
                   || '","ConNote":"EAN-125-' || (itg.invoice_id + 1050) || '"}]}',
               invoiced_by_person_id, now_ts
        FROM pg_temp.invoices_to_generate AS itg
        INNER JOIN sales.orders AS o
        ON itg.order_id = o."OrderID"
        INNER JOIN sales.customers AS c
        ON o."CustomerID" = c."CustomerID"
        INNER JOIN sales.customers AS btc
        ON btc."CustomerID" = c."BillToCustomerID";

        INSERT INTO sales.invoice_lines
            ("InvoiceID", "StockItemID", "Description", "PackageTypeID",
             "Quantity", "UnitPrice", "TaxRate", "TaxAmount", "LineProfit", "ExtendedPrice",
             "LastEditedBy", "LastEditedWhen")
        SELECT itg.invoice_id, ol."StockItemID", ol."Description", ol."PackageTypeID",
               ol."PickedQuantity", ol."UnitPrice", ol."TaxRate",
               round(ol."PickedQuantity" * ol."UnitPrice" * ol."TaxRate" / 100.0, 2),
               round(ol."PickedQuantity" * (ol."UnitPrice" - sih."LastCostPrice"), 2),
               round(ol."PickedQuantity" * ol."UnitPrice", 2)
                 + round(ol."PickedQuantity" * ol."UnitPrice" * ol."TaxRate" / 100.0, 2),
               invoiced_by_person_id, now_ts
        FROM pg_temp.invoices_to_generate AS itg
        INNER JOIN sales.order_lines AS ol
        ON itg.order_id = ol."OrderID"
        INNER JOIN warehouse.stock_items AS si
        ON ol."StockItemID" = si."StockItemID"
        INNER JOIN warehouse.stock_item_holdings AS sih
        ON si."StockItemID" = sih."StockItemID"
        ORDER BY ol."OrderID", ol."OrderLineID";

        INSERT INTO warehouse.stock_item_transactions
            ("StockItemID", "TransactionTypeID", "CustomerID", "InvoiceID", "SupplierID", "PurchaseOrderID",
             "TransactionOccurredWhen", "Quantity", "LastEditedBy", "LastEditedWhen")
        SELECT il."StockItemID", (SELECT tt."TransactionTypeID" FROM application.transaction_types AS tt WHERE tt."TransactionTypeName" = 'Stock Issue'),
               i."CustomerID", i."InvoiceID", NULL, NULL,
               now_ts, 0 - il."Quantity", invoiced_by_person_id, now_ts
        FROM pg_temp.invoices_to_generate AS itg
        INNER JOIN sales.invoice_lines AS il
        ON itg.invoice_id = il."InvoiceID"
        INNER JOIN sales.invoices AS i
        ON il."InvoiceID" = i."InvoiceID"
        ORDER BY il."InvoiceID", il."InvoiceLineID";

        WITH stock_item_totals AS
        (
            SELECT il."StockItemID", SUM(il."Quantity") AS total_quantity
            FROM sales.invoice_lines AS il
            WHERE il."InvoiceID" IN (SELECT invoice_id FROM pg_temp.invoices_to_generate)
            GROUP BY il."StockItemID"
        )
        UPDATE warehouse.stock_item_holdings AS sih
        SET "QuantityOnHand" = sih."QuantityOnHand" - sit.total_quantity,
            "LastEditedBy" = invoiced_by_person_id,
            "LastEditedWhen" = now_ts
        FROM stock_item_totals AS sit
        WHERE sih."StockItemID" = sit."StockItemID";

        INSERT INTO sales.customer_transactions
            ("CustomerID", "TransactionTypeID", "InvoiceID", "PaymentMethodID",
             "TransactionDate", "AmountExcludingTax", "TaxAmount", "TransactionAmount",
             "OutstandingBalance", "FinalizationDate", "LastEditedBy", "LastEditedWhen")
        SELECT i."BillToCustomerID",
               (SELECT tt."TransactionTypeID" FROM application.transaction_types AS tt WHERE tt."TransactionTypeName" = 'Customer Invoice'),
               itg.invoice_id,
               NULL,
               now_ts::date,
               (SELECT SUM(il."ExtendedPrice" - il."TaxAmount") FROM sales.invoice_lines AS il WHERE il."InvoiceID" = itg.invoice_id),
               (SELECT SUM(il."TaxAmount") FROM sales.invoice_lines AS il WHERE il."InvoiceID" = itg.invoice_id),
               (SELECT SUM(il."ExtendedPrice") FROM sales.invoice_lines AS il WHERE il."InvoiceID" = itg.invoice_id),
               (SELECT SUM(il."ExtendedPrice") FROM sales.invoice_lines AS il WHERE il."InvoiceID" = itg.invoice_id),
               NULL,
               invoiced_by_person_id,
               now_ts
        FROM pg_temp.invoices_to_generate AS itg
        INNER JOIN sales.invoices AS i
        ON itg.invoice_id = i."InvoiceID";
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Unable to invoice these orders';
        RAISE;
    END;
END;
$fn$;
