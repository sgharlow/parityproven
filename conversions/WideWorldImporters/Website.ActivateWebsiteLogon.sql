-- PL/pgSQL conversion of Website.ActivateWebsiteLogon (WideWorldImporters).
-- Engine: Kiro. No separate first draft was kept for this object.
-- WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.
--
-- Differences from a literal translation:
--  * The T-SQL procedure becomes a PostgreSQL PROCEDURE (CALL), since it returns nothing.
--  * HASHBYTES(N'SHA2_256', <nvarchar>) hashes the UTF-16LE bytes of the string. convert_to() cannot produce UTF-16,
--    so tsql_compat.utf16le() builds the bytes; sha256() is built in.
--  * @@ROWCOUNT = 0 -> NOT FOUND after the UPDATE; THROW 51000 -> RAISE EXCEPTION (SQLSTATE P0001). The PRINT before
--    THROW becomes RAISE NOTICE (informational, as PRINT is).
--  * The UPDATE's correlated subquery reads person 1 from the same table, as in the source.

CREATE SCHEMA IF NOT EXISTS tsql_compat;

-- UTF-16LE bytes of a string, as SQL Server stores nvarchar. Characters above U+FFFF become surrogate pairs.
CREATE OR REPLACE FUNCTION tsql_compat.utf16le(value text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
STRICT
AS $fn$
    SELECT COALESCE(string_agg(
               CASE WHEN s.cp < 65536 THEN
                        set_byte(set_byte('\x0000'::bytea, 0, s.cp & 255), 1, s.cp >> 8)
                    ELSE
                        set_byte(set_byte(set_byte(set_byte('\x00000000'::bytea,
                            0, (55296 + ((s.cp - 65536) >> 10)) & 255),
                            1, (55296 + ((s.cp - 65536) >> 10)) >> 8),
                            2, (56320 + ((s.cp - 65536) & 1023)) & 255),
                            3, (56320 + ((s.cp - 65536) & 1023)) >> 8)
               END, ''::bytea ORDER BY s.ord), ''::bytea)
    FROM (
        SELECT ascii(t.ch) AS cp, t.ord
        FROM regexp_split_to_table(value, '') WITH ORDINALITY AS t(ch, ord)
        WHERE t.ch <> ''
    ) AS s
$fn$;

CREATE OR REPLACE PROCEDURE website.activate_website_logon(
    person_id integer,
    logon_name text,
    initial_password text
)
LANGUAGE plpgsql
AS $fn$
BEGIN
    UPDATE application.people AS p
    SET "IsPermittedToLogon" = true,
        "LogonName" = logon_name,
        "HashedPassword" = sha256(tsql_compat.utf16le(initial_password || p."FullName")),
        "UserPreferences" = (SELECT t."UserPreferences" FROM application.people AS t WHERE t."PersonID" = 1) -- Person 1 has User Preferences template
    WHERE p."PersonID" = person_id
      AND p."PersonID" <> 1
      AND p."IsPermittedToLogon" = false;
    IF NOT FOUND THEN
        RAISE NOTICE 'The PersonID must be valid, must not be person 1, and must not already be enabled';
        RAISE EXCEPTION 'Invalid PersonID' USING ERRCODE = 'P0001';
    END IF;
END;
$fn$;
