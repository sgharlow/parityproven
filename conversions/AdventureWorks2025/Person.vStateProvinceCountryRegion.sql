-- PostgreSQL conversion of the view Person.vStateProvinceCountryRegion (AdventureWorks2025).
-- Engine: Kiro (mechanical draft via draft-view: identifiers quoted, table names snake_case).
-- Verified by the property-based harness, not by this script.

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
    ON sp."CountryRegionCode" = cr."CountryRegionCode";
