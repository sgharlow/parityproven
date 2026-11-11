-- PostgreSQL conversion of dbo.ufnGetAccountingStartDate (AdventureWorks2025).
-- Engine: Kiro first draft (see pair record).
-- datetime -> timestamp(3).

CREATE OR REPLACE FUNCTION dbo.ufn_get_accounting_start_date()
RETURNS timestamp(3)
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT TIMESTAMP '2003-07-01 00:00:00'
$$;
