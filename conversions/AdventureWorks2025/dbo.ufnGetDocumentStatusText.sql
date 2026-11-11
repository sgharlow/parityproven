-- PostgreSQL conversion of dbo.ufnGetDocumentStatusText (AdventureWorks2025).
-- Engine: Kiro first draft (see pair record).
-- tinyint -> smallint (PostgreSQL has no 1-byte integer); nvarchar(16) -> varchar(16).

CREATE OR REPLACE FUNCTION dbo.ufn_get_document_status_text(status smallint)
RETURNS varchar(16)
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE status
               WHEN 1 THEN 'Pending approval'
               WHEN 2 THEN 'Approved'
               WHEN 3 THEN 'Obsolete'
               ELSE '** Invalid **'
           END
$$;
