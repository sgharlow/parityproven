-- PL/pgSQL conversion of dbo.uspGetBillOfMaterials (AdventureWorks2025).
-- Engine: Kiro. Kiro's earlier conversion is kept as dbo.uspGetBillOfMaterials.draft.sql; datetime rounding added after the adversarial run of 2026-11-19 (cases A01-A06).
--
-- Differences from a literal translation:
--  * The procedure returns one result set, so it becomes a set-returning function (SELECT * FROM ...).
--  * OPTION (MAXRECURSION 25): SQL Server stops with error 530 when the recursive CTE would produce a row at recursion
--    level 26. PostgreSQL has no such option (a cycle would recurse forever), so the walk is bounded at level 26 and the
--    function raises (SQLSTATE 54001) if that level is reached, before returning any rows.
--  * ISNULL(b.EndDate, @CheckDate) -> COALESCE.

CREATE SCHEMA IF NOT EXISTS dbo;
-- datetime semantics: T-SQL datetime keeps 1/300 s ticks (.000, .003, .007), so SQL Server rounds @CheckDate and the
-- stored StartDate/EndDate to a tick (.001 -> .000, .002 -> .003, 23:59:59.999 -> the next midnight) before comparing.
-- timestamp keeps the value as given, so the comparison rounds every operand the same way (adversarial cases A01-A06, 2026-11-19).
CREATE OR REPLACE FUNCTION dbo.round_datetime(ts timestamp)
RETURNS timestamp
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT date_trunc('second', ts)
         + interval '1 millisecond' * ((((date_part('microseconds', ts)::integer % 1000000) * 3 + 5000) / 10000 * 10 + 1) / 3)
$fn$;

-- The recursive walk, bounded one level past the limit so that exceeding it is detectable.
CREATE OR REPLACE FUNCTION dbo.usp_get_bill_of_materials_walk(start_product_id integer, check_date timestamp)
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
            ON b."ComponentID" = p."ProductID"
        WHERE b."ProductAssemblyID" = start_product_id
            AND dbo.round_datetime(check_date) >= dbo.round_datetime(b."StartDate")
            AND dbo.round_datetime(check_date) <= COALESCE(dbo.round_datetime(b."EndDate"), dbo.round_datetime(check_date))
        UNION ALL
        -- Join recursive member to anchor
        SELECT b."ProductAssemblyID", b."ComponentID", p."Name", b."PerAssemblyQty", p."StandardCost", p."ListPrice", b."BOMLevel", cte.recursion_level + 1
        FROM bom_cte AS cte
            INNER JOIN production.bill_of_materials AS b
            ON b."ProductAssemblyID" = cte.component_id
            INNER JOIN production.product AS p
            ON b."ComponentID" = p."ProductID"
        WHERE dbo.round_datetime(check_date) >= dbo.round_datetime(b."StartDate")
            AND dbo.round_datetime(check_date) <= COALESCE(dbo.round_datetime(b."EndDate"), dbo.round_datetime(check_date))
            AND cte.recursion_level < 26
    )
    SELECT * FROM bom_cte
$fn$;

CREATE OR REPLACE FUNCTION dbo.usp_get_bill_of_materials(start_product_id integer, check_date timestamp)
RETURNS TABLE ("ProductAssemblyID" integer, "ComponentID" integer, "ComponentDesc" varchar(50), "TotalQuantity" numeric,
               "StandardCost" numeric(19,4), "ListPrice" numeric(19,4), "BOMLevel" smallint, "RecursionLevel" integer)
LANGUAGE plpgsql
STABLE
AS $fn$
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.usp_get_bill_of_materials_walk(start_product_id, check_date) AS r WHERE r.recursion_level > 25) THEN
        RAISE EXCEPTION 'The statement terminated. The maximum recursion 25 has been exhausted before statement completion.'
            USING ERRCODE = '54001';
    END IF;
    -- Outer select from the CTE
    RETURN QUERY
    SELECT r.product_assembly_id, r.component_id, r.component_desc, SUM(r.per_assembly_qty), r.standard_cost, r.list_price, r.bom_level, r.recursion_level
    FROM dbo.usp_get_bill_of_materials_walk(start_product_id, check_date) AS r
    GROUP BY r.component_id, r.component_desc, r.product_assembly_id, r.bom_level, r.recursion_level, r.standard_cost, r.list_price
    ORDER BY r.bom_level, r.product_assembly_id, r.component_id;
END;
$fn$;
