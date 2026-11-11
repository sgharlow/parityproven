-- PostgreSQL conversion of the view Purchasing.vVendorWithContacts (AdventureWorks2025).
-- Engine: Kiro (mechanical draft via draft-view: identifiers quoted, table names snake_case).
-- Verified by the property-based harness, not by this script.

CREATE OR REPLACE VIEW purchasing.v_vendor_with_contacts AS
SELECT
    v."BusinessEntityID" AS "BusinessEntityID"
    ,v."Name" AS "Name"
    ,ct."Name" AS "ContactType"
    ,p."Title" AS "Title"
    ,p."FirstName" AS "FirstName"
    ,p."MiddleName" AS "MiddleName"
    ,p."LastName" AS "LastName"
    ,p."Suffix" AS "Suffix"
    ,pp."PhoneNumber" AS "PhoneNumber"
	,pnt."Name" AS "PhoneNumberType"
    ,ea."EmailAddress" AS "EmailAddress"
    ,p."EmailPromotion" AS "EmailPromotion"
FROM purchasing.vendor v
    INNER JOIN person.business_entity_contact bec
    ON bec."BusinessEntityID" = v."BusinessEntityID"
	INNER JOIN person.contact_type ct
	ON ct."ContactTypeID" = bec."ContactTypeID"
	INNER JOIN person.person p
	ON p."BusinessEntityID" = bec."PersonID"
	LEFT OUTER JOIN person.email_address ea
	ON ea."BusinessEntityID" = p."BusinessEntityID"
	LEFT OUTER JOIN person.person_phone pp
	ON pp."BusinessEntityID" = p."BusinessEntityID"
	LEFT OUTER JOIN person.phone_number_type pnt
	ON pnt."PhoneNumberTypeID" = pp."PhoneNumberTypeID";
