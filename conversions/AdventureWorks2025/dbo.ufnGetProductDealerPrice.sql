-- PostgreSQL conversion of dbo.ufnGetProductDealerPrice (AdventureWorks2025).
-- Engine: Kiro; first draft corrected after the harness failed it (see pair record), and again after the adversarial
-- run of 2026-11-19 (cases A01-A06).
-- money -> numeric(19,4) (not PostgreSQL's locale-dependent money type); datetime -> timestamp.
-- Precondition: at most one price period per product (T-SQL `SELECT @x = ...` keeps the last row read).
--
-- In T-SQL, money * money is computed at 4 decimal places and rounded, so the product of the list price
-- and @DealerDiscount (a money variable) is rounded to 4 places (e.g. -0.0001 * 0.60 = -0.0001, not
-- -0.00006). The 0.60 literal alone would give exact numeric arithmetic, so the rounding is explicit.
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
CREATE OR REPLACE FUNCTION dbo.ufn_get_product_dealer_price(product_id integer, order_date timestamp)
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
        SELECT round(plph."ListPrice" * 0.60, 4)  -- 60% of list price, at money precision
          FROM production.product AS p
         INNER JOIN production.product_list_price_history AS plph
            ON p."ProductID" = plph."ProductID"
           AND p."ProductID" = product_id
           AND plph."StartDate" < below
           AND COALESCE(plph."EndDate", TIMESTAMP '9999-12-31 00:00:00') >= from_
         LIMIT 1);
END
$$;
