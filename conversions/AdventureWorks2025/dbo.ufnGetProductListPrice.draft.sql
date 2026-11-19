-- PostgreSQL conversion of dbo.ufnGetProductListPrice (AdventureWorks2025).
-- Engine: Kiro first draft (see pair record).
-- money -> numeric(19,4); datetime -> timestamp.
-- Precondition: at most one price period per product (T-SQL `SELECT @x = ...` keeps the last row read).

CREATE OR REPLACE FUNCTION dbo.ufn_get_product_list_price(product_id integer, order_date timestamp)
RETURNS numeric(19,4)
LANGUAGE sql
STABLE
AS $$
    SELECT plph."ListPrice"
      FROM production.product AS p
     INNER JOIN production.product_list_price_history AS plph
        ON p."ProductID" = plph."ProductID"
       AND p."ProductID" = product_id
       AND order_date BETWEEN plph."StartDate" AND COALESCE(plph."EndDate", TIMESTAMP '9999-12-31 00:00:00')
     LIMIT 1
$$;
