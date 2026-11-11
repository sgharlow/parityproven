-- PostgreSQL conversion of dbo.ufnGetPurchaseOrderStatusText (AdventureWorks2025).
-- Engine: Kiro first draft (see pair record).
-- tinyint -> smallint; nvarchar(15) -> varchar(15).

CREATE OR REPLACE FUNCTION dbo.ufn_get_purchase_order_status_text(status smallint)
RETURNS varchar(15)
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE status
               WHEN 1 THEN 'Pending'
               WHEN 2 THEN 'Approved'
               WHEN 3 THEN 'Rejected'
               WHEN 4 THEN 'Complete'
               ELSE '** Invalid **'
           END
$$;
