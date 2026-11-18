-- PostgreSQL conversion of the view HumanResources.vEmployee (AdventureWorks2025).
-- Engine: Kiro (mechanical draft via draft-view: identifiers quoted, table names snake_case).
-- Verified by the property-based harness, not by this script.

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
    ON cr."CountryRegionCode" = sp."CountryRegionCode"
    LEFT OUTER JOIN person.person_phone pp
    ON pp."BusinessEntityID" = p."BusinessEntityID"
    LEFT OUTER JOIN person.phone_number_type pnt
    ON pp."PhoneNumberTypeID" = pnt."PhoneNumberTypeID"
    LEFT OUTER JOIN person.email_address ea
    ON p."BusinessEntityID" = ea."BusinessEntityID";
