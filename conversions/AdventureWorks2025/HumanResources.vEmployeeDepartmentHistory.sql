-- PostgreSQL conversion of the view HumanResources.vEmployeeDepartmentHistory (AdventureWorks2025).
-- Engine: Kiro (mechanical draft via draft-view: identifiers quoted, table names snake_case).
-- Verified by the property-based harness, not by this script.

CREATE OR REPLACE VIEW humanresources.v_employee_department_history AS
SELECT
    e."BusinessEntityID" AS "BusinessEntityID"
    ,p."Title" AS "Title"
    ,p."FirstName" AS "FirstName"
    ,p."MiddleName" AS "MiddleName"
    ,p."LastName" AS "LastName"
    ,p."Suffix" AS "Suffix"
    ,s."Name" AS "Shift"
    ,d."Name" AS "Department"
    ,d."GroupName" AS "GroupName"
    ,edh."StartDate" AS "StartDate"
    ,edh."EndDate" AS "EndDate"
FROM humanresources.employee e
	INNER JOIN person.person p
	ON p."BusinessEntityID" = e."BusinessEntityID"
    INNER JOIN humanresources.employee_department_history edh
    ON e."BusinessEntityID" = edh."BusinessEntityID"
    INNER JOIN humanresources.department d
    ON edh."DepartmentID" = d."DepartmentID"
    INNER JOIN humanresources.shift s
    ON s."ShiftID" = edh."ShiftID";
