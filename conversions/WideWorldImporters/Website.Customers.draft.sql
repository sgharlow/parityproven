-- PostgreSQL conversion of the view Website.Customers (WideWorldImporters).
-- Engine: Kiro first draft (see pair record).
--
-- First draft: omits s.DeliveryLocation (SQL Server geography) because the image then in use had no PostGIS.

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
