-- First draft: multiply list price by 0.60 in numeric arithmetic.

CREATE OR REPLACE FUNCTION dbo.ufn_get_product_dealer_price(product_id integer, order_date timestamp)
RETURNS numeric(19,4)
LANGUAGE sql
STABLE
AS $$
    SELECT plph."ListPrice" * 0.60            -- 60% of list price
      FROM production.product AS p
     INNER JOIN production.product_list_price_history AS plph
        ON p."ProductID" = plph."ProductID"
       AND p."ProductID" = product_id
       AND order_date BETWEEN plph."StartDate" AND COALESCE(plph."EndDate", TIMESTAMP '9999-12-31 00:00:00')
     LIMIT 1
$$;
