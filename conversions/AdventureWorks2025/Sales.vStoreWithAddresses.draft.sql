-- PostgreSQL conversion of the view Sales.vStoreWithAddresses (AdventureWorks2025).
-- Engine: Kiro (mechanical draft via draft-view: identifiers quoted, table names snake_case).
-- Verified by the property-based harness, not by this script.

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
    ON cr."CountryRegionCode" = sp."CountryRegionCode"
    INNER JOIN person.address_type at
    ON at."AddressTypeID" = bea."AddressTypeID";
