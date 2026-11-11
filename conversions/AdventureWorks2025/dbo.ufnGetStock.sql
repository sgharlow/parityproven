-- PostgreSQL conversion of dbo.ufnGetStock (AdventureWorks2025).
-- Engine: Kiro first draft (see pair record).
-- SUM(smallint) is int in T-SQL; the PostgreSQL SUM(smallint) is bigint, so it is cast back to integer.
-- The source compares LocationID (smallint) with the string '6'; here it is the number 6.

CREATE OR REPLACE FUNCTION dbo.ufn_get_stock(product_id integer)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(SUM(p."Quantity"), 0)::integer
      FROM production.product_inventory AS p
     WHERE p."ProductID" = product_id
       AND p."LocationID" = 6          -- only look at inventory in the misc storage
$$;
