-- PL/pgSQL conversion of Sequences.ReseedSequenceBeyondTableValues (WideWorldImporters).
-- Engine: Kiro first draft (see pair record).

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
    SELECT s.last_value INTO current_sequence_maximum_value
    FROM pg_sequences AS s
    WHERE s.sequencename = sequence_name
      AND s.schemaname = 'sequences';

    EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I.%I', column_name, schema_name, table_name)
        INTO current_table_maximum_value;

    IF current_table_maximum_value >= current_sequence_maximum_value THEN
        new_sequence_value := current_table_maximum_value + 1;
        EXECUTE format('ALTER SEQUENCE sequences.%I RESTART WITH %s', sequence_name, new_sequence_value);
    END IF;
END;
$fn$;
