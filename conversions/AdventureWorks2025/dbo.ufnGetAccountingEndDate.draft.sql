-- First draft: subtract 2 milliseconds exactly, as the T-SQL reads.

CREATE OR REPLACE FUNCTION dbo.ufn_get_accounting_end_date()
RETURNS timestamp(3)
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT TIMESTAMP '2004-07-01 00:00:00' - INTERVAL '2 milliseconds'
$$;
