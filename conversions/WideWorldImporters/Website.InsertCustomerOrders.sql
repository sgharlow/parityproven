-- PL/pgSQL conversion of Website.InsertCustomerOrders (WideWorldImporters).
-- Engine: Kiro. No separate first draft was kept for this object.
-- WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.
--
-- Differences from a literal translation:
--  * The table-valued parameter types Website.OrderList / Website.OrderLineList become composite types and the
--    parameters arrays of them. *_from_json builds them from a JSON array (CALL arguments cannot contain subqueries).
--  * The @OrdersToGenerate table variable becomes two arrays filled by a statement of their own, so every order's ID
--    is allocated before any insert, as in the source. (An earlier version allocated inside the INSERT statement; the
--    property check found that PostgreSQL then stops calling nextval() at the first failing row, consuming fewer IDs
--    than SQL Server.) As with NEXT VALUE FOR, the IDs stay consumed if the inserts fail.
--  * SYSDATETIME() -> localtimestamp (and ::date where the column is a date).
--  * TRY/CATCH + ROLLBACK + THROW (re-raise) -> an exception block that undoes the inserts and re-raises the same error.

CREATE SCHEMA IF NOT EXISTS website;

DO $do$
BEGIN
    CREATE TYPE website.order_list AS (
        "OrderReference"              integer,
        "CustomerID"                  integer,
        "ContactPersonID"             integer,
        "ExpectedDeliveryDate"        date,
        "CustomerPurchaseOrderNumber" varchar(20),
        "IsUndersupplyBackordered"    boolean,
        "Comments"                    text,
        "DeliveryInstructions"        text
    );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END
$do$;

DO $do$
BEGIN
    CREATE TYPE website.order_line_list AS (
        "OrderReference" integer,
        "StockItemID"    integer,
        "Description"    varchar(100),
        "Quantity"       integer
    );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END
$do$;

CREATE OR REPLACE FUNCTION website.order_list_from_json(rows jsonb)
RETURNS website.order_list[]
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT coalesce(array_agg(jsonb_populate_record(NULL::website.order_list, r) ORDER BY ord), '{}')
    FROM jsonb_array_elements(rows) WITH ORDINALITY AS e(r, ord)
$fn$;

CREATE OR REPLACE FUNCTION website.order_line_list_from_json(rows jsonb)
RETURNS website.order_line_list[]
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT coalesce(array_agg(jsonb_populate_record(NULL::website.order_line_list, r) ORDER BY ord), '{}')
    FROM jsonb_array_elements(rows) WITH ORDINALITY AS e(r, ord)
$fn$;

CREATE OR REPLACE PROCEDURE website.insert_customer_orders(
    orders website.order_list[],
    order_lines website.order_line_list[],
    orders_created_by_person_id integer,
    salesperson_person_id integer
)
LANGUAGE plpgsql
AS $fn$
DECLARE
    order_references integer[];
    order_ids        integer[];
BEGIN
    -- allocate the new order numbers first, in their own statement (as the source does): every order consumes a value
    -- even if inserting the orders fails later
    SELECT array_agg(a.order_reference ORDER BY a.order_reference), array_agg(a.order_id ORDER BY a.order_reference)
    INTO order_references, order_ids
    FROM (SELECT o."OrderReference" AS order_reference, nextval('sequences."OrderID"')::integer AS order_id
          FROM unnest(orders) AS o) AS a;

    BEGIN
        WITH orders_to_generate AS (
            SELECT g.order_reference, g.order_id
            FROM unnest(order_references, order_ids) AS g(order_reference, order_id)
        ),
        inserted_orders AS (
            INSERT INTO sales.orders
                ("OrderID", "CustomerID", "SalespersonPersonID", "PickedByPersonID", "ContactPersonID", "BackorderOrderID", "OrderDate",
                 "ExpectedDeliveryDate", "CustomerPurchaseOrderNumber", "IsUndersupplyBackordered", "Comments", "DeliveryInstructions", "InternalComments",
                 "PickingCompletedWhen", "LastEditedBy", "LastEditedWhen")
            SELECT otg.order_id, o."CustomerID", salesperson_person_id, NULL, o."ContactPersonID", NULL, localtimestamp::date,
                   o."ExpectedDeliveryDate", o."CustomerPurchaseOrderNumber", o."IsUndersupplyBackordered", o."Comments", o."DeliveryInstructions", NULL,
                   NULL, orders_created_by_person_id, localtimestamp
            FROM orders_to_generate AS otg
            INNER JOIN unnest(orders) AS o
            ON otg.order_reference = o."OrderReference"
            RETURNING 1
        )
        INSERT INTO sales.order_lines
            ("OrderID", "StockItemID", "Description", "PackageTypeID", "Quantity", "UnitPrice",
             "TaxRate", "PickedQuantity", "PickingCompletedWhen", "LastEditedBy", "LastEditedWhen")
        SELECT otg.order_id, ol."StockItemID", ol."Description", si."UnitPackageID", ol."Quantity",
               website.calculate_customer_price(o."CustomerID", ol."StockItemID", localtimestamp::date),
               si."TaxRate", 0, NULL, orders_created_by_person_id, localtimestamp
        FROM orders_to_generate AS otg
        INNER JOIN unnest(order_lines) AS ol
        ON otg.order_reference = ol."OrderReference"
        INNER JOIN unnest(orders) AS o
        ON ol."OrderReference" = o."OrderReference"
        INNER JOIN warehouse.stock_items AS si
        ON ol."StockItemID" = si."StockItemID";
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Unable to create the customer orders.';
        RAISE;
    END;
END;
$fn$;
