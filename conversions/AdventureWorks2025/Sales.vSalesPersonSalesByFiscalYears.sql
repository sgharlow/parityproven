-- PostgreSQL conversion of the view Sales.vSalesPersonSalesByFiscalYears (AdventureWorks2025).
-- Engine: Kiro first draft (see pair record). Written by hand: PIVOT has no PostgreSQL equivalent.
--
-- PIVOT (SUM(SubTotal) FOR FiscalYear IN (2002, 2003, 2004)) becomes conditional aggregation.
-- PIVOT groups by every non-pivoted column of the source derived table (SalesPersonID, FullName,
-- JobTitle, SalesTerritory), so the same columns are the GROUP BY here.
-- YEAR(DATEADD(m, 6, OrderDate)) -> extract(year from OrderDate + interval '6 months').
-- T-SQL string + yields NULL if any operand is NULL; || does too, so FirstName/LastName NULLs agree.

CREATE OR REPLACE VIEW sales.v_sales_person_sales_by_fiscal_years AS
SELECT
    soh."SalesPersonID"                                              AS "SalesPersonID",
    soh."FullName"                                                   AS "FullName",
    soh."JobTitle"                                                   AS "JobTitle",
    soh."SalesTerritory"                                             AS "SalesTerritory",
    sum(soh."SubTotal") FILTER (WHERE soh."FiscalYear" = 2002)       AS "2002",
    sum(soh."SubTotal") FILTER (WHERE soh."FiscalYear" = 2003)       AS "2003",
    sum(soh."SubTotal") FILTER (WHERE soh."FiscalYear" = 2004)       AS "2004"
FROM (SELECT
        soh."SalesPersonID",
        p."FirstName" || ' ' || COALESCE(p."MiddleName", '') || ' ' || p."LastName" AS "FullName",
        e."JobTitle",
        st."Name" AS "SalesTerritory",
        soh."SubTotal",
        extract(year FROM soh."OrderDate" + interval '6 months')::integer AS "FiscalYear"
    FROM sales.sales_person sp
        INNER JOIN sales.sales_order_header soh ON sp."BusinessEntityID" = soh."SalesPersonID"
        INNER JOIN sales.sales_territory st ON sp."TerritoryID" = st."TerritoryID"
        INNER JOIN humanresources.employee e ON soh."SalesPersonID" = e."BusinessEntityID"
        INNER JOIN person.person p ON p."BusinessEntityID" = sp."BusinessEntityID"
     ) AS soh
GROUP BY soh."SalesPersonID", soh."FullName", soh."JobTitle", soh."SalesTerritory";
