-- PostgreSQL conversion of the view HumanResources.vEmployee (AdventureWorks2025).
-- Engine: Kiro (mechanical draft via draft-view: identifiers quoted, table names snake_case; kept as the .draft.sql),
-- corrected by Kiro on 2026-11-18 after step 2 found a difference that step 3's generated data had not produced.
-- No human edit; the owner's step 5 review of this corrected version is still to come.
--
-- The source database's collation is SQL_Latin1_General_CP1_CI_AS, so the join on CountryRegionCode is case-insensitive
-- ('us' joins 'US'), accent-sensitive, and ignores trailing spaces ('US ' joins 'US'); PostgreSQL '=' is none of those.
-- Same fix as Person.vStateProvinceCountryRegion: rtrim under a nondeterministic case-insensitive ICU collation.
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

CREATE OR REPLACE VIEW humanresources.v_employee AS
SELECT
    e."BusinessEntityID" AS "BusinessEntityID"
    ,p."Title" AS "Title"
    ,p."FirstName" AS "FirstName"
    ,p."MiddleName" AS "MiddleName"
    ,p."LastName" AS "LastName"
    ,p."Suffix" AS "Suffix"
    ,e."JobTitle" AS "JobTitle" 
    ,pp."PhoneNumber" AS "PhoneNumber"
    ,pnt."Name" AS "PhoneNumberType"
    ,ea."EmailAddress" AS "EmailAddress"
    ,p."EmailPromotion" AS "EmailPromotion"
    ,a."AddressLine1" AS "AddressLine1"
    ,a."AddressLine2" AS "AddressLine2"
    ,a."City" AS "City"
    ,sp."Name" AS "StateProvinceName"
    ,a."PostalCode" AS "PostalCode"
    ,cr."Name" AS "CountryRegionName"
    ,p."AdditionalContactInfo" AS "AdditionalContactInfo"
FROM humanresources.employee e
	INNER JOIN person.person p
	ON p."BusinessEntityID" = e."BusinessEntityID"
    INNER JOIN person.business_entity_address bea
    ON bea."BusinessEntityID" = e."BusinessEntityID"
    INNER JOIN person.address a
    ON a."AddressID" = bea."AddressID"
    INNER JOIN person.state_province sp
    ON sp."StateProvinceID" = a."StateProvinceID"
    INNER JOIN person.country_region cr
    ON tsql_compat.ci_as_key(cr."CountryRegionCode") COLLATE tsql_compat.ci_as_equal = tsql_compat.ci_as_key(sp."CountryRegionCode") COLLATE tsql_compat.ci_as_equal
    LEFT OUTER JOIN person.person_phone pp
    ON pp."BusinessEntityID" = p."BusinessEntityID"
    LEFT OUTER JOIN person.phone_number_type pnt
    ON pp."PhoneNumberTypeID" = pnt."PhoneNumberTypeID"
    LEFT OUTER JOIN person.email_address ea
    ON p."BusinessEntityID" = ea."BusinessEntityID";
