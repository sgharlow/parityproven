-- PL/pgSQL conversion of Sequences.ReseedSequenceBeyondTableValues (WideWorldImporters).
-- Engine: Kiro; the first draft is kept in Sequences.ReseedSequenceBeyondTableValues.draft.sql and its result is in the pair record.
--
-- Differences from a literal translation:
--  * Dynamic SQL: EXECUTE (@SQL) with QUOTENAME -> EXECUTE format() with %I; the #CurrentValue temp table that carries
--    MAX() out of the dynamic statement -> EXECUTE ... INTO.
--  * sys.sequences.current_value -> the sequence's own last_value column. pg_sequences.last_value is not the same: it is
--    NULL before first use and after RESTART, where SQL Server reports the start / restart value.
--  * Names arrive in SQL Server form (Sales, StockItems, StockItemID). This project's PostgreSQL naming is schema in
--    lower case, table in snake_case, column and sequence names quoted as declared, so the table name is mapped.

CREATE SCHEMA IF NOT EXISTS sequences;

CREATE OR REPLACE PROCEDURE sequences.reseed_sequence_beyond_table_values(
    sequence_name text,
    schema_name text,
    table_name text,
    column_name text
)
LANGUAGE plpgsql
AS $fn$
DECLARE
    current_table_maximum_value bigint;
    new_sequence_value bigint;
    current_sequence_maximum_value bigint;
BEGIN
    -- Ensures that the next sequence value is above the maximum value of the supplied table column
    IF EXISTS (SELECT 1 FROM pg_sequences AS s WHERE s.schemaname = 'sequences' AND s.sequencename = sequence_name) THEN
        EXECUTE format('SELECT last_value FROM sequences.%I', sequence_name)
            INTO current_sequence_maximum_value;
    END IF;

    EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I.%I',
                   column_name,
                   lower(schema_name),
                   lower(regexp_replace(table_name, '([a-z0-9])([A-Z])', '\1_\2', 'g')))
        INTO current_table_maximum_value;

    IF current_table_maximum_value >= current_sequence_maximum_value THEN
        new_sequence_value := current_table_maximum_value + 1;
        EXECUTE format('ALTER SEQUENCE sequences.%I RESTART WITH %s', sequence_name, new_sequence_value);
    END IF;
END;
$fn$;
