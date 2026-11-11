-- PostgreSQL conversion of dbo.ufnGetSalesOrderStatusText (AdventureWorks2025).
-- Engine: Kiro first draft (see pair record).
-- tinyint -> smallint; nvarchar(15) -> varchar(15).

CREATE OR REPLACE FUNCTION dbo.ufn_get_sales_order_status_text(status smallint)
RETURNS varchar(15)
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE status
               WHEN 1 THEN 'In process'
               WHEN 2 THEN 'Approved'
               WHEN 3 THEN 'Backordered'
               WHEN 4 THEN 'Rejected'
               WHEN 5 THEN 'Shipped'
               WHEN 6 THEN 'Cancelled'
               ELSE '** Invalid **'
           END
$$;
