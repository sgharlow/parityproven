-- PostgreSQL conversion of the view Website.Customers (WideWorldImporters).
-- Engine: Kiro first draft (see pair record).
--
-- KNOWN GAP: the source view exposes s.DeliveryLocation, a SQL Server geography column.
-- PostgreSQL has no built-in equivalent; it needs PostGIS, which is not in the pinned
-- postgres:18 image. This view omits the column, so its interface differs from the source
-- and it cannot be called equivalent. Mapping the column (PostGIS geography, or a lossy
-- text/lat-long form) is a decision for the project owner, not something to guess.

CREATE OR REPLACE VIEW website.customers AS
SELECT s."CustomerID"            AS "CustomerID",
       s."CustomerName"          AS "CustomerName",
       sc."CustomerCategoryName" AS "CustomerCategoryName",
       pp."FullName"             AS "PrimaryContact",
       ap."FullName"             AS "AlternateContact",
       s."PhoneNumber"           AS "PhoneNumber",
       s."FaxNumber"             AS "FaxNumber",
       bg."BuyingGroupName"      AS "BuyingGroupName",
       s."WebsiteURL"            AS "WebsiteURL",
       dm."DeliveryMethodName"   AS "DeliveryMethod",
       c."CityName"              AS "CityName",
       s."DeliveryRun"           AS "DeliveryRun",
       s."RunPosition"           AS "RunPosition"
FROM sales.customers AS s
LEFT OUTER JOIN sales.customer_categories AS sc ON s."CustomerCategoryID" = sc."CustomerCategoryID"
LEFT OUTER JOIN application.people AS pp ON s."PrimaryContactPersonID" = pp."PersonID"
LEFT OUTER JOIN application.people AS ap ON s."AlternateContactPersonID" = ap."PersonID"
LEFT OUTER JOIN sales.buying_groups AS bg ON s."BuyingGroupID" = bg."BuyingGroupID"
LEFT OUTER JOIN application.delivery_methods AS dm ON s."DeliveryMethodID" = dm."DeliveryMethodID"
LEFT OUTER JOIN application.cities AS c ON s."DeliveryCityID" = c."CityID";
