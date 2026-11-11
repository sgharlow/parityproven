-- PostgreSQL conversion of dbo.ufnGetProductDealerPrice (AdventureWorks2025).
-- Engine: Kiro; first draft corrected after the harness failed it (see pair record).
-- money -> numeric(19,4) (not PostgreSQL's locale-dependent money type); datetime -> timestamp.
-- Precondition: at most one price period per product (T-SQL `SELECT @x = ...` keeps the last row read).
--
-- In T-SQL, money * money is computed at 4 decimal places and rounded, so the product of the list price
-- and @DealerDiscount (a money variable) is rounded to 4 places (e.g. -0.0001 * 0.60 = -0.0001, not
-- -0.00006). The 0.60 literal alone would give exact numeric arithmetic, so the rounding is explicit.

CREATE OR REPLACE FUNCTION dbo.ufn_get_product_dealer_price(product_id integer, order_date timestamp)
RETURNS numeric(19,4)
LANGUAGE sql
STABLE
AS $$
    SELECT round(plph."ListPrice" * 0.60, 4)  -- 60% of list price, at money precision
      FROM production.product AS p
     INNER JOIN production.product_list_price_history AS plph
        ON p."ProductID" = plph."ProductID"
       AND p."ProductID" = product_id
       AND order_date BETWEEN plph."StartDate" AND COALESCE(plph."EndDate", TIMESTAMP '9999-12-31 00:00:00')
     LIMIT 1
$$;
