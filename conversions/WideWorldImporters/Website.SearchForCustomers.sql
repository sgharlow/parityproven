-- PL/pgSQL conversion of Website.SearchForCustomers (WideWorldImporters).
-- Engine: Kiro. The shared helpers below (collation, sort key, LIKE translation) were developed and verified on
-- Website.SearchForStockItems; no separate first draft was kept for this object.
-- WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted where the source declares it.
--
-- Differences from a literal translation:
--  * T-SQL LIKE is not PostgreSQL LIKE ('[..]' classes, no escape character, case-insensitive): tsql_compat.like_to_regex.
--  * ORDER BY follows the source's case-insensitive, accent-sensitive Windows collation (collation and sort key below).
--  * FOR JSON AUTO omits NULL-valued keys (json_strip_nulls does the same) and, with ROOT, returns an empty string
--    when no row qualifies (not an empty array); reproduced.
CREATE SCHEMA IF NOT EXISTS tsql_compat;

-- ICU, case-insensitive and accent-sensitive (level 2), with the order of ASCII punctuation and space tailored to the
-- Windows collation Latin1_General_100_CI_AS. That order was measured on SQL Server 2025
-- (ORDER BY ... COLLATE Latin1_General_100_CI_AS over chr(32)..chr(126)); digits and letters already agree with ICU.
-- Deterministic: values that differ only in case are ordered by bytes (SQL Server leaves that order undefined).
CREATE COLLATION IF NOT EXISTS tsql_compat.latin1_general_100_ci_as (
    provider = icu, locale = 'und-u-ks-level2', deterministic = true,
    rules = $r$& ' ' < '!' < '"' < '#' < '$' < '%' < '&' < '(' < ')' < '*' < ',' < '.' < '/' < ':' < ';' < '?' < '@' < '[' < '\' < ']' < '^' < '_' < '`' < '{' < '|' < '}' < '~' < '+' < '<' < '=' < '>'$r$
);

-- Sort keys strip hyphens and apostrophes: that Windows collation sorts "by word", so they carry no weight (SQL_*
-- collations sort by string and would not do this). Written inline, not as a function: PostgreSQL sorts a key that
-- goes through an inlined SQL function much more slowly.

-- Translate a T-SQL LIKE pattern into an anchored PostgreSQL regular expression (use with ~*, case-insensitive).
--   %  any string        _  any one character
--   [abc] [a-c] [^abc]   character class; an unterminated '[' takes the rest of the pattern as the class;
--                        an empty class matches nothing; a reversed range (c-a) matches nothing; '^' negates only first
--   every other character, including backslash, matches itself
CREATE OR REPLACE FUNCTION tsql_compat.like_to_regex(pattern text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
    result text := '';
    i      integer := 1;
    n      integer;
    c      text;
    j      integer;
    body   text;
    negate boolean;
    items  text;
    k      integer;
    lo     text;
    hi     text;
    ends_wild boolean := false;
BEGIN
    IF pattern IS NULL THEN
        RETURN NULL;
    END IF;
    n := char_length(pattern);
    WHILE i <= n LOOP
        c := substr(pattern, i, 1);
        ends_wild := false;
        IF c = '%' THEN
            result := result || '.*';
            ends_wild := true;
        ELSIF c = '_' THEN
            result := result || '.';
        ELSIF c = '[' THEN
            j := position(']' in substr(pattern, i + 1));
            IF j = 0 THEN
                body := substr(pattern, i + 1);
                i := n;
            ELSE
                body := substr(pattern, i + 1, j - 1);
                i := i + j;
            END IF;
            negate := left(body, 1) = '^';
            IF negate THEN
                body := substr(body, 2);
            END IF;
            items := '';
            k := 1;
            WHILE k <= char_length(body) LOOP
                lo := substr(body, k, 1);
                IF substr(body, k + 1, 1) = '-' AND k + 2 <= char_length(body) THEN
                    hi := substr(body, k + 2, 1);
                    IF ascii(lo) <= ascii(hi) THEN
                        items := items || CASE WHEN position(lo in '\]^[-') > 0 THEN '\' ELSE '' END || lo
                                       || '-'
                                       || CASE WHEN position(hi in '\]^[-') > 0 THEN '\' ELSE '' END || hi;
                    END IF;
                    k := k + 3;
                ELSE
                    items := items || CASE WHEN position(lo in '\]^[-') > 0 THEN '\' ELSE '' END || lo;
                    k := k + 1;
                END IF;
            END LOOP;
            IF items = '' THEN
                result := result || CASE WHEN negate THEN '.' ELSE '(?!)' END;
            ELSE
                result := result || '[' || CASE WHEN negate THEN '^' ELSE '' END || items || ']';
            END IF;
        ELSIF position(c in '\.^$|?*+()[]{}') > 0 THEN
            result := result || '\' || c;
        ELSE
            result := result || c;
        END IF;
        i := i + 1;
    END LOOP;
    -- A leading or trailing % needs no '.*' in a search: leaving the regular expression unanchored there is the same
    -- test, and much cheaper for the regex engine on long strings.
    IF left(pattern, 1) = '%' THEN
        result := substr(result, 3);
    END IF;
    IF ends_wild AND result <> '' THEN
        result := left(result, char_length(result) - 2);
    END IF;
    RETURN CASE WHEN left(pattern, 1) = '%' THEN '' ELSE '^' END
        || '(?:' || result || ')'
        || CASE WHEN ends_wild THEN '' ELSE '$' END;
END;
$fn$;

CREATE OR REPLACE FUNCTION website.search_for_customers(
    search_text text,
    maximum_rows_to_return integer
)
RETURNS text
LANGUAGE sql
STABLE
AS $fn$
    -- The inner query only finds and orders the rows; the JSON is built afterwards, for the rows that are returned.
    SELECT CASE WHEN count(*) = 0 THEN ''
                ELSE json_strip_nulls(json_build_object('Customers', json_agg(
                         json_build_object(
                             'CustomerID', r."CustomerID",
                             'CustomerName', r."CustomerName",
                             'PhoneNumber', r."PhoneNumber",
                             'FaxNumber', r."FaxNumber",
                             'ct', json_build_array(json_build_object(
                                 'CityName', r."CityName",
                                 -- an unmatched LEFT JOIN still yields one (empty, once NULLs are stripped) element: "p":[{}]
                                 'p', json_build_array(json_build_object(
                                          'PrimaryContactFullName', r."FullName",
                                          'PrimaryContactPreferredName', r."PreferredName")))))
                         ORDER BY r.sort_key COLLATE tsql_compat.latin1_general_100_ci_as)))::text
           END
    FROM (
        SELECT c."CustomerID", c."CustomerName", c."PhoneNumber", c."FaxNumber",
               ct."CityName", p."FullName", p."PreferredName",
               replace(replace(c."CustomerName", '-', ''), '''', '') AS sort_key
        FROM sales.customers AS c
        INNER JOIN application.cities AS ct ON c."DeliveryCityID" = ct."CityID"
        LEFT OUTER JOIN application.people AS p ON c."PrimaryContactPersonID" = p."PersonID"
        WHERE concat(c."CustomerName", ' ', p."FullName", ' ', p."PreferredName") ~* tsql_compat.like_to_regex('%' || search_text || '%')
        ORDER BY replace(replace(c."CustomerName", '-', ''), '''', '') COLLATE tsql_compat.latin1_general_100_ci_as
        LIMIT maximum_rows_to_return
    ) AS r
$fn$;