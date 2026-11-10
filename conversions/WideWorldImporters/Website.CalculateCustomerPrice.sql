-- PL/pgSQL conversion of the scalar function Website.CalculateCustomerPrice (WideWorldImporters).
-- Engine: Kiro first draft (see pair record).
-- WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.
-- Local variables are lower_snake_case; table columns are quoted, so they cannot collide.

CREATE OR REPLACE FUNCTION website.calculate_customer_price(
    customer_id   integer,
    stock_item_id integer,
    pricing_date  date
)
RETURNS numeric(18,2)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    calculated_price            numeric(18,2);
    unit_price                  numeric(18,2);
    lowest_unit_price           numeric(18,2);
    highest_discount_amount     numeric(18,2);
    highest_discount_percentage numeric(18,3);
    buying_group_id             integer;
    customer_category_id        integer;
    discounted_unit_price       numeric(18,2);
BEGIN
    SELECT c."BuyingGroupID", c."CustomerCategoryID"
      INTO buying_group_id, customer_category_id
      FROM sales.customers AS c
     WHERE c."CustomerID" = customer_id;

    SELECT si."UnitPrice"
      INTO unit_price
      FROM warehouse.stock_items AS si
     WHERE si."StockItemID" = stock_item_id;

    calculated_price := unit_price;

    lowest_unit_price := (SELECT MIN(sd."UnitPrice")
                            FROM sales.special_deals AS sd
                           WHERE ((sd."StockItemID" = stock_item_id) OR (sd."StockItemID" IS NULL))
                             AND ((sd."CustomerID" = customer_id) OR (sd."CustomerID" IS NULL))
                             AND ((sd."BuyingGroupID" = buying_group_id) OR (sd."BuyingGroupID" IS NULL))
                             AND ((sd."CustomerCategoryID" = customer_category_id) OR (sd."CustomerCategoryID" IS NULL))
                             AND ((sd."StockGroupID" IS NULL) OR EXISTS (SELECT 1 FROM warehouse.stock_item_stock_groups AS sisg
                                                                          WHERE sisg."StockItemID" = stock_item_id
                                                                            AND sisg."StockGroupID" = sd."StockGroupID"))
                             AND sd."UnitPrice" IS NOT NULL
                             AND pricing_date BETWEEN sd."StartDate" AND sd."EndDate");
    IF lowest_unit_price IS NOT NULL AND lowest_unit_price < unit_price THEN
        calculated_price := lowest_unit_price;
    END IF;

    highest_discount_amount := (SELECT MAX(sd."DiscountAmount")
                                  FROM sales.special_deals AS sd
                                 WHERE ((sd."StockItemID" = stock_item_id) OR (sd."StockItemID" IS NULL))
                                   AND ((sd."CustomerID" = customer_id) OR (sd."CustomerID" IS NULL))
                                   AND ((sd."BuyingGroupID" = buying_group_id) OR (sd."BuyingGroupID" IS NULL))
                                   AND ((sd."CustomerCategoryID" = customer_category_id) OR (sd."CustomerCategoryID" IS NULL))
                                   AND ((sd."StockGroupID" IS NULL) OR EXISTS (SELECT 1 FROM warehouse.stock_item_stock_groups AS sisg
                                                                                WHERE sisg."StockItemID" = stock_item_id
                                                                                  AND sisg."StockGroupID" = sd."StockGroupID"))
                                   AND sd."DiscountAmount" IS NOT NULL
                                   AND pricing_date BETWEEN sd."StartDate" AND sd."EndDate");
    IF highest_discount_amount IS NOT NULL AND (unit_price - highest_discount_amount) < calculated_price THEN
        calculated_price := unit_price - highest_discount_amount;
    END IF;

    highest_discount_percentage := (SELECT MAX(sd."DiscountPercentage")
                                      FROM sales.special_deals AS sd
                                     WHERE ((sd."StockItemID" = stock_item_id) OR (sd."StockItemID" IS NULL))
                                       AND ((sd."CustomerID" = customer_id) OR (sd."CustomerID" IS NULL))
                                       AND ((sd."BuyingGroupID" = buying_group_id) OR (sd."BuyingGroupID" IS NULL))
                                       AND ((sd."CustomerCategoryID" = customer_category_id) OR (sd."CustomerCategoryID" IS NULL))
                                       AND ((sd."StockGroupID" IS NULL) OR EXISTS (SELECT 1 FROM warehouse.stock_item_stock_groups AS sisg
                                                                                    WHERE sisg."StockItemID" = stock_item_id
                                                                                      AND sisg."StockGroupID" = sd."StockGroupID"))
                                       AND sd."DiscountPercentage" IS NOT NULL
                                       AND pricing_date BETWEEN sd."StartDate" AND sd."EndDate");
    IF highest_discount_percentage IS NOT NULL THEN
        discounted_unit_price := round(unit_price * highest_discount_percentage / 100.0, 2);
        IF discounted_unit_price < calculated_price THEN
            calculated_price := discounted_unit_price;
        END IF;
    END IF;

    RETURN calculated_price;
END;
$$;
