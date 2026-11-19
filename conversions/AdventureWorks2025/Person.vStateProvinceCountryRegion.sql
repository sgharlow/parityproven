-- PostgreSQL conversion of the view Person.vStateProvinceCountryRegion (AdventureWorks2025).
-- Engine: Kiro (mechanical draft via draft-view: identifiers quoted, table names snake_case; kept as the .draft.sql),
-- corrected by Kiro on 2026-11-18 after step 2 found a difference that step 3's generated data had not produced.
-- No human edit; the owner's step 5 review is still to come.
--
-- The source database's collation is SQL_Latin1_General_CP1_CI_AS, so the join
--   sp.CountryRegionCode = cr.CountryRegionCode
-- is case-insensitive ('us' joins 'US'), accent-sensitive, and ignores trailing spaces ('CA ' joins 'CA').
-- PostgreSQL's '=' is none of those. The join compares the codes without trailing spaces under a case-insensitive,
-- accent-sensitive ICU collation (strength level 2). It must be nondeterministic for '=' to use it.
-- Checked for the text the harness and the fixed cases use (ASCII codes), not for every collation rule.
CREATE SCHEMA IF NOT EXISTS tsql_compat;
CREATE COLLATION IF NOT EXISTS tsql_compat.ci_as_equal (
    provider = icu, locale = 'und-u-ks-level2', deterministic = false
);
-- Adversarial run 2026-11-19 (cases A02-A04): the ICU collation alone differs from SQL Server's on 'Æ' = 'AE' and
-- 'ß' = 'SS' (SQL Server equal, ICU not) and on the Kelvin sign U+212A and the soft hyphen U+00AD (ICU equates U+212A with
-- 'K' and ignores U+00AD; SQL Server does neither). PostgreSQL 18 ignores the ICU strength when tailoring rules are given, so
-- ci_as_key() trims trailing spaces and maps those characters (the last two to private-use code points) before the
-- comparison. Checked for the characters the cases use, not for every collation rule.
CREATE OR REPLACE FUNCTION tsql_compat.ci_as_key(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
    SELECT replace(replace(replace(translate(rtrim(s, ' '), U&'\00AD\212A', U&'\E000\E001'), 'ß', 'ss'), 'æ', 'ae'), 'Æ', 'AE')
$fn$;

CREATE OR REPLACE VIEW person.v_state_province_country_region AS
SELECT
    sp."StateProvinceID" AS "StateProvinceID"
    ,sp."StateProvinceCode" AS "StateProvinceCode"
    ,sp."IsOnlyStateProvinceFlag" AS "IsOnlyStateProvinceFlag"
    ,sp."Name" AS "StateProvinceName"
    ,sp."TerritoryID" AS "TerritoryID"
    ,cr."CountryRegionCode" AS "CountryRegionCode"
    ,cr."Name" AS "CountryRegionName"
FROM person.state_province sp
    INNER JOIN person.country_region cr
    ON tsql_compat.ci_as_key(sp."CountryRegionCode") COLLATE tsql_compat.ci_as_equal = tsql_compat.ci_as_key(cr."CountryRegionCode") COLLATE tsql_compat.ci_as_equal;
