-- PL/pgSQL conversion of Website.SearchForStockItems (WideWorldImporters).
-- Engine: Kiro first draft (see pair record).
-- WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.

CREATE OR REPLACE FUNCTION website.search_for_stock_items(
    search_text text,
    maximum_rows_to_return integer
)
RETURNS text
LANGUAGE sql
STABLE
AS $fn$
    SELECT json_build_object('StockItems', COALESCE(json_agg(r.item ORDER BY r.rn), '[]'::json))::text
    FROM (
        SELECT json_build_object('StockItemID', si."StockItemID", 'StockItemName', si."StockItemName") AS item,
               row_number() OVER (ORDER BY si."StockItemName") AS rn
        FROM warehouse.stock_items AS si
        WHERE si."SearchDetails" ILIKE '%' || search_text || '%'
        ORDER BY si."StockItemName"
        LIMIT maximum_rows_to_return
    ) AS r
$fn$;
