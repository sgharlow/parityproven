-- PostgreSQL conversion of the view Sales.vStoreWithAddresses (AdventureWorks2025).
-- Engine: Kiro (mechanical draft via draft-view: identifiers quoted, table names snake_case; kept as the .draft.sql),
-- corrected by Kiro on 2026-11-18 after step 2 found a difference that step 3's generated data had not produced.
-- No human edit; the owner's step 5 review is still to come.
--
-- The source database's collation is SQL_Latin1_General_CP1_CI_AS, so the join on CountryRegionCode is case-insensitive
-- ('us' joins 'US'), accent-sensitive, and ignores trailing spaces ('US ' joins 'US'); PostgreSQL '=' is none of those.
-- Same fix as Person.vStateProvinceCountryRegion: rtrim under a nondeterministic case-insensitive ICU collation.
-- Checked for the text the harness and the fixed cases use (ASCII codes), not for every collation rule.
CREATE SCHEMA IF NOT EXISTS tsql_compat;
CREATE COLLATION IF NOT EXISTS tsql_compat.ci_as_equal (
    provider = icu, locale = 'und-u-ks-level2', deterministic = false
);

CREATE OR REPLACE VIEW sales.v_store_with_addresses AS
SELECT
    s."BusinessEntityID" AS "BusinessEntityID"
    ,s."Name" AS "Name"
    ,at."Name" AS "AddressType"
    ,a."AddressLine1" AS "AddressLine1"
    ,a."AddressLine2" AS "AddressLine2"
    ,a."City" AS "City"
    ,sp."Name" AS "StateProvinceName"
    ,a."PostalCode" AS "PostalCode"
    ,cr."Name" AS "CountryRegionName"
FROM sales.store s
    INNER JOIN person.business_entity_address bea
    ON bea."BusinessEntityID" = s."BusinessEntityID"
    INNER JOIN person.address a
    ON a."AddressID" = bea."AddressID"
    INNER JOIN person.state_province sp
    ON sp."StateProvinceID" = a."StateProvinceID"
    INNER JOIN person.country_region cr
    ON rtrim(cr."CountryRegionCode", ' ') COLLATE tsql_compat.ci_as_equal = rtrim(sp."CountryRegionCode", ' ') COLLATE tsql_compat.ci_as_equal
    INNER JOIN person.address_type at
    ON at."AddressTypeID" = bea."AddressTypeID";
