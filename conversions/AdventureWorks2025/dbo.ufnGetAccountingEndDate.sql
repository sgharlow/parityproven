-- PostgreSQL conversion of dbo.ufnGetAccountingEndDate (AdventureWorks2025).
-- Engine: Kiro; first draft was corrected after the harness failed it (see pair record).
--
-- The source is DATEADD(millisecond, -2, CONVERT(datetime, '20040701', 112)). SQL Server datetime has
-- 3.33 ms resolution, so midnight minus 2 ms is stored as .997, not .998. PostgreSQL timestamp keeps
-- the exact value, so the result is written as the value datetime actually yields.

CREATE OR REPLACE FUNCTION dbo.ufn_get_accounting_end_date()
RETURNS timestamp(3)
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT TIMESTAMP '2004-06-30 23:59:59.997'
$$;
