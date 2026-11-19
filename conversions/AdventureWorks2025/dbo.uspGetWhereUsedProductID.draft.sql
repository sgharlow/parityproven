-- PL/pgSQL conversion of dbo.uspGetWhereUsedProductID (AdventureWorks2025).
-- Engine: Kiro. No separate first draft was kept for this object.
--
-- Differences from a literal translation:
--  * The procedure returns one result set, so it becomes a set-returning function (SELECT * FROM ...).
--  * OPTION (MAXRECURSION 25): SQL Server stops with error 530 when the recursive CTE would produce a row at recursion
--    level 26. PostgreSQL has no such option (a cycle would recurse forever), so the walk is bounded at level 26 and the
--    function raises (SQLSTATE 54001) if that level is reached, before returning any rows.
--  * ISNULL(b.EndDate, @CheckDate) -> COALESCE.

CREATE SCHEMA IF NOT EXISTS dbo;

-- The recursive walk (from a component up to the assemblies that use it), bounded one level past the limit.
CREATE OR REPLACE FUNCTION dbo.usp_get_where_used_product_id_walk(start_product_id integer, check_date timestamp)
RETURNS TABLE (product_assembly_id integer, component_id integer, component_desc varchar(50), per_assembly_qty numeric(8,2),
               standard_cost numeric(19,4), list_price numeric(19,4), bom_level smallint, recursion_level integer)
LANGUAGE sql
STABLE
AS $fn$
    WITH RECURSIVE bom_cte (product_assembly_id, component_id, component_desc, per_assembly_qty, standard_cost, list_price, bom_level, recursion_level) AS (
        -- Get the initial list of components for the bike assembly
        SELECT b."ProductAssemblyID", b."ComponentID", p."Name", b."PerAssemblyQty", p."StandardCost", p."ListPrice", b."BOMLevel", 0
        FROM production.bill_of_materials AS b
            INNER JOIN production.product AS p
            ON b."ProductAssemblyID" = p."ProductID"
        WHERE b."ComponentID" = start_product_id
            AND check_date >= b."StartDate"
            AND check_date <= COALESCE(b."EndDate", check_date)
        UNION ALL
        -- Join recursive member to anchor
        SELECT b."ProductAssemblyID", b."ComponentID", p."Name", b."PerAssemblyQty", p."StandardCost", p."ListPrice", b."BOMLevel", cte.recursion_level + 1
        FROM bom_cte AS cte
            INNER JOIN production.bill_of_materials AS b
            ON cte.product_assembly_id = b."ComponentID"
            INNER JOIN production.product AS p
            ON b."ProductAssemblyID" = p."ProductID"
        WHERE check_date >= b."StartDate"
            AND check_date <= COALESCE(b."EndDate", check_date)
            AND cte.recursion_level < 26
    )
    SELECT * FROM bom_cte
$fn$;

CREATE OR REPLACE FUNCTION dbo.usp_get_where_used_product_id(start_product_id integer, check_date timestamp)
RETURNS TABLE ("ProductAssemblyID" integer, "ComponentID" integer, "ComponentDesc" varchar(50), "TotalQuantity" numeric,
               "StandardCost" numeric(19,4), "ListPrice" numeric(19,4), "BOMLevel" smallint, "RecursionLevel" integer)
LANGUAGE plpgsql
STABLE
AS $fn$
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.usp_get_where_used_product_id_walk(start_product_id, check_date) AS r WHERE r.recursion_level > 25) THEN
        RAISE EXCEPTION 'The statement terminated. The maximum recursion 25 has been exhausted before statement completion.'
            USING ERRCODE = '54001';
    END IF;
    -- Outer select from the CTE
    RETURN QUERY
    SELECT r.product_assembly_id, r.component_id, r.component_desc, SUM(r.per_assembly_qty), r.standard_cost, r.list_price, r.bom_level, r.recursion_level
    FROM dbo.usp_get_where_used_product_id_walk(start_product_id, check_date) AS r
    GROUP BY r.component_id, r.component_desc, r.product_assembly_id, r.bom_level, r.recursion_level, r.standard_cost, r.list_price
    ORDER BY r.bom_level, r.product_assembly_id, r.component_id;
END;
$fn$;
