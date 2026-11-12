-- PL/pgSQL conversion of the multi-statement table-valued function dbo.ufnGetContactInformation (AdventureWorks2025).
-- Engine: Kiro. No separate first draft was kept for this object.
--
-- Differences from a literal translation:
--  * The @retContactInformation table variable it fills becomes RETURN QUERY steps; the function returns them in the
--    same sequence (employee, vendor contact, store contact, consumer). The source does not define an order for the rows.

CREATE SCHEMA IF NOT EXISTS dbo;

CREATE OR REPLACE FUNCTION dbo.ufn_get_contact_information(person_id integer)
RETURNS TABLE ("PersonID" integer, "FirstName" varchar(50), "LastName" varchar(50), "JobTitle" varchar(50), "BusinessEntityType" varchar(50))
LANGUAGE plpgsql
STABLE
AS $fn$
BEGIN
    -- Returns the first name, last name, job title and business entity type for the specified contact.
    -- Since a contact can serve multiple roles, more than one row may be returned.
    IF person_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM humanresources.employee AS e
                   WHERE e."BusinessEntityID" = person_id) THEN
            RETURN QUERY
            SELECT person_id, p."FirstName", p."LastName", e."JobTitle", 'Employee'::varchar(50)
            FROM humanresources.employee AS e
                INNER JOIN person.person AS p
                ON p."BusinessEntityID" = e."BusinessEntityID"
            WHERE e."BusinessEntityID" = person_id;
        END IF;

        IF EXISTS (SELECT 1 FROM purchasing.vendor AS v
                       INNER JOIN person.business_entity_contact AS bec
                       ON bec."BusinessEntityID" = v."BusinessEntityID"
                   WHERE bec."PersonID" = person_id) THEN
            RETURN QUERY
            SELECT person_id, p."FirstName", p."LastName", ct."Name", 'Vendor Contact'::varchar(50)
            FROM purchasing.vendor AS v
                INNER JOIN person.business_entity_contact AS bec
                ON bec."BusinessEntityID" = v."BusinessEntityID"
                INNER JOIN person.contact_type AS ct
                ON ct."ContactTypeID" = bec."ContactTypeID"
                INNER JOIN person.person AS p
                ON p."BusinessEntityID" = bec."PersonID"
            WHERE bec."PersonID" = person_id;
        END IF;

        IF EXISTS (SELECT 1 FROM sales.store AS s
                       INNER JOIN person.business_entity_contact AS bec
                       ON bec."BusinessEntityID" = s."BusinessEntityID"
                   WHERE bec."PersonID" = person_id) THEN
            RETURN QUERY
            SELECT person_id, p."FirstName", p."LastName", ct."Name", 'Store Contact'::varchar(50)
            FROM sales.store AS s
                INNER JOIN person.business_entity_contact AS bec
                ON bec."BusinessEntityID" = s."BusinessEntityID"
                INNER JOIN person.contact_type AS ct
                ON ct."ContactTypeID" = bec."ContactTypeID"
                INNER JOIN person.person AS p
                ON p."BusinessEntityID" = bec."PersonID"
            WHERE bec."PersonID" = person_id;
        END IF;

        IF EXISTS (SELECT 1 FROM person.person AS p
                       INNER JOIN sales.customer AS c
                       ON c."PersonID" = p."BusinessEntityID"
                   WHERE p."BusinessEntityID" = person_id AND c."StoreID" IS NULL) THEN
            RETURN QUERY
            SELECT person_id, p."FirstName", p."LastName", NULL::varchar(50), 'Consumer'::varchar(50)
            FROM person.person AS p
                INNER JOIN sales.customer AS c
                ON c."PersonID" = p."BusinessEntityID"
            WHERE p."BusinessEntityID" = person_id AND c."StoreID" IS NULL;
        END IF;
    END IF;
    RETURN;
END;
$fn$;
