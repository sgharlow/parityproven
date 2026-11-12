-- PL/pgSQL conversion of Website.ChangePassword (WideWorldImporters).
-- Engine: Kiro. No separate first draft was kept for this object.
-- WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.
--
-- Differences from a literal translation:
--  * The T-SQL procedure becomes a PostgreSQL PROCEDURE (CALL), since it returns nothing.
--  * HASHBYTES(N'SHA2_256', <nvarchar>) hashes the UTF-16LE bytes of the string: tsql_compat.utf16le() + sha256().
--    The comparison with the stored hash is a binary (bytea) comparison, as varbinary comparison is on SQL Server.
--  * @@ROWCOUNT = 0 -> NOT FOUND; THROW 51000 -> RAISE EXCEPTION (SQLSTATE P0001); PRINT -> RAISE NOTICE.

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

CREATE OR REPLACE PROCEDURE website.change_password(
    person_id integer,
    old_password text,
    new_password text
)
LANGUAGE plpgsql
AS $fn$
BEGIN
    UPDATE application.people AS p
    SET "IsPermittedToLogon" = true,
        "HashedPassword" = sha256(tsql_compat.utf16le(new_password || p."FullName"))
    WHERE p."PersonID" = person_id
      AND p."PersonID" <> 1
      AND p."HashedPassword" = sha256(tsql_compat.utf16le(old_password || p."FullName"));
    IF NOT FOUND THEN
        RAISE NOTICE 'The PersonID must be valid, and the old password must be valid.';
        RAISE NOTICE 'If the user has also changed name, please contact the IT staff to assist.';
        RAISE EXCEPTION 'Invalid Password Change' USING ERRCODE = 'P0001';
    END IF;
END;
$fn$;
