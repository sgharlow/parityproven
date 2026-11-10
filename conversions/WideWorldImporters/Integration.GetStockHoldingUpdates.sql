-- PL/pgSQL conversion of Integration.GetStockHoldingUpdates (WideWorldImporters).
-- Engine: Kiro first draft (see pair record).
-- WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted. No parameters.

CREATE OR REPLACE FUNCTION integration.get_stock_holding_updates()
RETURNS TABLE (
    "Quantity On Hand"        integer,
    "Bin Location"            varchar(20),
    "Last Stocktake Quantity" integer,
    "Last Cost Price"         numeric,
    "Reorder Level"           integer,
    "Target Stock Level"      integer,
    "WWI Stock Item ID"       integer
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        sih."QuantityOnHand",
        sih."BinLocation",
        sih."LastStocktakeQuantity",
        sih."LastCostPrice",
        sih."ReorderLevel",
        sih."TargetStockLevel",
        sih."StockItemID"
    FROM warehouse.stock_item_holdings AS sih
    ORDER BY sih."StockItemID"
$$;
