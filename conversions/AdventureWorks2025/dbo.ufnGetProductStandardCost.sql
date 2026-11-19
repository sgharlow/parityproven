-- PostgreSQL conversion of dbo.ufnGetProductStandardCost (AdventureWorks2025).
-- Engine: Kiro first draft (see pair record), corrected after the adversarial run of 2026-11-19 (cases A01-A06).
-- money -> numeric(19,4); datetime -> timestamp.
-- Precondition: at most one cost period per product (T-SQL `SELECT @x = ...` keeps the last row read).
--
-- @OrderDate, StartDate and EndDate are datetime in T-SQL, so SQL Server rounds each of them to its 1/300 s ticks
-- (.001 -> .000, .002 -> .003, 23:59:59.999 -> the next midnight; halves round up) before BETWEEN compares them.
-- timestamp keeps the value as given. Rounding is monotonic, so with d = the argument rounded to tick k of its second:
--   round(StartDate) <= d  exactly when  StartDate <  second + (k + 0.5)/300 s
--   round(EndDate)   >= d  exactly when  EndDate   >= second + (k - 0.5)/300 s
-- Both bounds are computed once per call from the argument in integer microseconds: us = microseconds within the
-- second, k = (us*3 + 5000) / 10000, bound offsets ceil((2k +/- 1) * 5000/3) = ((2k +/- 1) * 5000 + 2) / 3 (integer
-- division truncates toward zero, which is the ceiling here, also for k = 0). The columns are compared as stored.
--
-- PL/pgSQL, not LANGUAGE sql: inside a SQL-language function the bound expressions cost about 5 us per call
-- (20,000 calls: 280 ms against 170 ms without them, measured 2026-11-19); as PL/pgSQL variables they cost about 1.5 us.
CREATE OR REPLACE FUNCTION dbo.ufn_get_product_standard_cost(product_id integer, order_date timestamp)
RETURNS numeric(19,4)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    us    integer   := date_part('microseconds', order_date)::integer % 1000000;
    k     integer   := (us * 3 + 5000) / 10000;
    below timestamp := order_date + interval '1 microsecond' * (((2 * k + 1) * 5000 + 2) / 3 - us);
    from_ timestamp := order_date + interval '1 microsecond' * (((2 * k - 1) * 5000 + 2) / 3 - us);
BEGIN
    RETURN (
        SELECT pch."StandardCost"
          FROM production.product AS p
         INNER JOIN production.product_cost_history AS pch
            ON p."ProductID" = pch."ProductID"
           AND p."ProductID" = product_id
           AND pch."StartDate" < below
           AND COALESCE(pch."EndDate", TIMESTAMP '9999-12-31 00:00:00') >= from_
         LIMIT 1);
END
$$;
