-- PostgreSQL conversion of dbo.ufnGetProductStandardCost (AdventureWorks2025).
-- Engine: Kiro first draft (see pair record).
-- money -> numeric(19,4); datetime -> timestamp.
-- Precondition: at most one cost period per product (T-SQL `SELECT @x = ...` keeps the last row read).

CREATE OR REPLACE FUNCTION dbo.ufn_get_product_standard_cost(product_id integer, order_date timestamp)
RETURNS numeric(19,4)
LANGUAGE sql
STABLE
AS $$
    SELECT pch."StandardCost"
      FROM production.product AS p
     INNER JOIN production.product_cost_history AS pch
        ON p."ProductID" = pch."ProductID"
       AND p."ProductID" = product_id
       AND order_date BETWEEN pch."StartDate" AND COALESCE(pch."EndDate", TIMESTAMP '9999-12-31 00:00:00')
     LIMIT 1
$$;
