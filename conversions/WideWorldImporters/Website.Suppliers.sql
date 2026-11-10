-- PostgreSQL conversion of the view Website.Suppliers (WideWorldImporters).
-- Engine: Kiro first draft (see pair record).
--
-- DeliveryLocation is a SQL Server geography column; it maps to PostGIS geography (SRID 4326)
-- in the pinned postgis/postgis:18-3.6 image. History: the first draft omitted this column
-- because the earlier image had no PostGIS; that draft was recorded as a failed pair.

CREATE OR REPLACE VIEW website.suppliers AS
SELECT s."SupplierID"            AS "SupplierID",
       s."SupplierName"          AS "SupplierName",
       sc."SupplierCategoryName" AS "SupplierCategoryName",
       pp."FullName"             AS "PrimaryContact",
       ap."FullName"             AS "AlternateContact",
       s."PhoneNumber"           AS "PhoneNumber",
       s."FaxNumber"             AS "FaxNumber",
       s."WebsiteURL"            AS "WebsiteURL",
       dm."DeliveryMethodName"   AS "DeliveryMethod",
       c."CityName"              AS "CityName",
       s."DeliveryLocation"      AS "DeliveryLocation",
       s."SupplierReference"     AS "SupplierReference"
FROM purchasing.suppliers AS s
LEFT OUTER JOIN purchasing.supplier_categories AS sc ON s."SupplierCategoryID" = sc."SupplierCategoryID"
LEFT OUTER JOIN application.people AS pp ON s."PrimaryContactPersonID" = pp."PersonID"
LEFT OUTER JOIN application.people AS ap ON s."AlternateContactPersonID" = ap."PersonID"
LEFT OUTER JOIN application.delivery_methods AS dm ON s."DeliveryMethodID" = dm."DeliveryMethodID"
LEFT OUTER JOIN application.cities AS c ON s."DeliveryCityID" = c."CityID";
