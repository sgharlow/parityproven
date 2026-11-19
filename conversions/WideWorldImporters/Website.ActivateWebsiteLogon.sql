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

-- Adversarial run 2026-11-19 (cases A01, A02, A04): the T-SQL parameters are nvarchar(50) and nvarchar(40), and SQL Server
-- cuts a longer argument to that many UTF-16 code units without an error. PostgreSQL text parameters keep everything, so the
-- procedure cuts them the same way. A character that would straddle the limit is dropped whole (SQL Server would keep half a
-- surrogate pair; not checked). Checked for the inputs the cases use.
CREATE OR REPLACE FUNCTION tsql_compat.truncate_utf16(value text, max_units integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $fn$
    SELECT COALESCE(string_agg(s.ch, '' ORDER BY s.ord), '')
    FROM (
        SELECT t.ch, t.ord,
               sum(CASE WHEN ascii(t.ch) > 65535 THEN 2 ELSE 1 END) OVER (ORDER BY t.ord) AS units
        FROM regexp_split_to_table(value, '') WITH ORDINALITY AS t(ch, ord)
        WHERE t.ch <> ''
    ) AS s
    WHERE s.units <= max_units
$fn$;

CREATE OR REPLACE PROCEDURE website.activate_website_logon(
    person_id integer,
    logon_name text,
    initial_password text
)
LANGUAGE plpgsql
AS $fn$
BEGIN
    logon_name := tsql_compat.truncate_utf16(logon_name, 50);
    initial_password := tsql_compat.truncate_utf16(initial_password, 40);

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
