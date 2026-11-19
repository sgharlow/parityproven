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
    actual_sequence_name text;
    actual_column_name text;
    target_table text;
BEGIN
    -- Ensures that the next sequence value is above the maximum value of the supplied table column

    -- Adversarial run 2026-11-19 (cases A01-A05): SQL Server's catalog lookup and identifier resolution ignore case and
    -- trailing spaces, and a NULL name makes the dynamic statement NULL, which EXECUTE skips. PostgreSQL's %I raises on NULL
    -- and resolves names exactly, so the names are matched here ignoring case and trailing spaces, and a NULL schema, table
    -- or column name ends the call without doing anything. Checked for the characters the cases use, not for every collation rule.
    IF schema_name IS NULL OR table_name IS NULL OR column_name IS NULL THEN
        RETURN;
    END IF;

    SELECT s.sequencename::text INTO actual_sequence_name
    FROM pg_sequences AS s
    WHERE s.schemaname = 'sequences'
      AND lower(rtrim(s.sequencename::text, ' ')) = lower(rtrim(sequence_name, ' '))
    LIMIT 1;
    IF actual_sequence_name IS NOT NULL THEN
        EXECUTE format('SELECT last_value FROM sequences.%I', actual_sequence_name)
            INTO current_sequence_maximum_value;
    END IF;

    target_table := format('%I.%I',
                           lower(schema_name),
                           lower(regexp_replace(table_name, '([a-z0-9])([A-Z])', '\1_\2', 'g')));

    SELECT a.attname::text INTO actual_column_name
    FROM pg_attribute AS a
    WHERE a.attrelid = target_table::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND lower(rtrim(a.attname::text, ' ')) = lower(rtrim(column_name, ' '))
    LIMIT 1;

    EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %s', COALESCE(actual_column_name, column_name), target_table)
        INTO current_table_maximum_value;

    IF current_table_maximum_value >= current_sequence_maximum_value THEN
        new_sequence_value := current_table_maximum_value + 1;
        EXECUTE format('ALTER SEQUENCE sequences.%I RESTART WITH %s', actual_sequence_name, new_sequence_value);
    END IF;
END;
$fn$;
