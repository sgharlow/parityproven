-- PostgreSQL conversion of the view Production.vProductAndDescription (AdventureWorks2025).
-- Engine: Kiro (mechanical draft via draft-view: identifiers quoted, table names snake_case).
-- Verified by the property-based harness, not by this script.

CREATE OR REPLACE VIEW production.v_product_and_description AS
SELECT
    p."ProductID" AS "ProductID"
    ,p."Name" AS "Name"
    ,pm."Name" AS "ProductModel"
    ,pmx."CultureID" AS "CultureID"
    ,pd."Description" AS "Description"
FROM production.product p
    INNER JOIN production.product_model pm
    ON p."ProductModelID" = pm."ProductModelID"
    INNER JOIN production.product_model_product_description_culture pmx
    ON pm."ProductModelID" = pmx."ProductModelID"
    INNER JOIN production.product_description pd
    ON pmx."ProductDescriptionID" = pd."ProductDescriptionID";
