-- PostgreSQL conversion of the view Sales.vIndividualCustomer (AdventureWorks2025).
-- Engine: Kiro (mechanical draft via draft-view: identifiers quoted, table names snake_case).
-- Verified by the property-based harness, not by this script.

CREATE OR REPLACE VIEW sales.v_individual_customer AS
SELECT
    p."BusinessEntityID" AS "BusinessEntityID"
    ,p."Title" AS "Title"
    ,p."FirstName" AS "FirstName"
    ,p."MiddleName" AS "MiddleName"
    ,p."LastName" AS "LastName"
    ,p."Suffix" AS "Suffix"
    ,pp."PhoneNumber" AS "PhoneNumber"
	,pnt."Name" AS "PhoneNumberType"
    ,ea."EmailAddress" AS "EmailAddress"
    ,p."EmailPromotion" AS "EmailPromotion"
    ,at."Name" AS "AddressType"
    ,a."AddressLine1" AS "AddressLine1"
    ,a."AddressLine2" AS "AddressLine2"
    ,a."City" AS "City"
    ,sp."Name" AS "StateProvinceName"
    ,a."PostalCode" AS "PostalCode"
    ,cr."Name" AS "CountryRegionName"
    ,p."Demographics" AS "Demographics"
FROM person.person p
    INNER JOIN person.business_entity_address bea
    ON bea."BusinessEntityID" = p."BusinessEntityID"
    INNER JOIN person.address a
    ON a."AddressID" = bea."AddressID"
    INNER JOIN person.state_province sp
    ON sp."StateProvinceID" = a."StateProvinceID"
    INNER JOIN person.country_region cr
    ON cr."CountryRegionCode" = sp."CountryRegionCode"
    INNER JOIN person.address_type at
    ON at."AddressTypeID" = bea."AddressTypeID"
	INNER JOIN sales.customer c
	ON c."PersonID" = p."BusinessEntityID"
	LEFT OUTER JOIN person.email_address ea
	ON ea."BusinessEntityID" = p."BusinessEntityID"
	LEFT OUTER JOIN person.person_phone pp
	ON pp."BusinessEntityID" = p."BusinessEntityID"
	LEFT OUTER JOIN person.phone_number_type pnt
	ON pnt."PhoneNumberTypeID" = pp."PhoneNumberTypeID"
WHERE c."StoreID" IS NULL;
