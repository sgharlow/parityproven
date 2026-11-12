-- PL/pgSQL conversion of Website.RecordVehicleTemperature (WideWorldImporters).
-- Engine: Kiro. No separate first draft was kept for this object.
-- WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.
--
-- Differences from a literal translation (T-SQL behaviour measured on SQL Server 2025, compatibility level 130):
--  * @FullSensorDataArray is nvarchar(1000): longer input is silently truncated, which can make it invalid JSON.
--  * ISJSON is 1 only for a JSON object or array; NULL for NULL (which is then not rejected and inserts nothing).
--  * OPENJSON ... WITH works on the original JSON text: lax paths, the first of duplicate keys wins, object/array values
--    read as NULL for scalar columns, nvarchar(40) truncates, '$' AS JSON is the element's original text, and an object
--    (rather than an array) at $.Recordings is a single row whose '$' AS JSON is NULL. The json
--    type (not jsonb) keeps the original text and key order, so the helpers below use json.
--  * The WITH clause converts strings with T-SQL rules (tsql_compat.to_int / to_decimal / to_datetime2).
--  * TRY/CATCH + THROW 51000 -> an exception block that re-raises as SQLSTATE P0001; PRINT -> RAISE NOTICE.

CREATE SCHEMA IF NOT EXISTS tsql_compat;

-- ISJSON(value): 1 for a valid JSON object or array, 0 otherwise, NULL for NULL.
CREATE OR REPLACE FUNCTION tsql_compat.isjson(value text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT CASE WHEN value IS NULL THEN NULL
                WHEN value IS JSON OBJECT OR value IS JSON ARRAY THEN 1
                ELSE 0
           END
$fn$;

-- Lax member access with SQL Server's rule for duplicate keys: the first occurrence wins. NULL when doc is not an object.
CREATE OR REPLACE FUNCTION tsql_compat.json_member(doc json, member text)
RETURNS json
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
    result json;
BEGIN
    IF doc IS NULL OR json_typeof(doc) <> 'object' THEN
        RETURN NULL;
    END IF;
    SELECT e.value INTO result
    FROM json_each(doc) WITH ORDINALITY AS e(key, value, ord)
    WHERE e.key = member
    ORDER BY e.ord LIMIT 1;
    RETURN result;
END;
$fn$;

-- Lax path $.a.b.c
CREATE OR REPLACE FUNCTION tsql_compat.json_path(doc json, path text[])
RETURNS json
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
    result json := doc;
    step text;
BEGIN
    FOREACH step IN ARRAY path LOOP
        result := tsql_compat.json_member(result, step);
    END LOOP;
    RETURN result;
END;
$fn$;

-- The rows OPENJSON(doc) ... WITH (...) returns (measured): one per array element, in document order; for an object,
-- a single row that is the object itself (and its '$' AS JSON column is NULL); nothing for a scalar or NULL.
CREATE OR REPLACE FUNCTION tsql_compat.openjson_with_rows(doc json)
RETURNS TABLE (value json, from_array boolean)
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
BEGIN
    IF doc IS NULL THEN
        RETURN;
    ELSIF json_typeof(doc) = 'array' THEN
        RETURN QUERY SELECT a.value, true FROM json_array_elements(doc) WITH ORDINALITY AS a(value, ord) ORDER BY a.ord;
    ELSIF json_typeof(doc) = 'object' THEN
        RETURN QUERY SELECT doc, false;
    END IF;
END;
$fn$;

-- The text OPENJSON ... WITH sees for a scalar column: strings unescaped, numbers and booleans as written, NULL otherwise.
CREATE OR REPLACE FUNCTION tsql_compat.json_scalar(v json)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT CASE json_typeof(v)
               WHEN 'string' THEN v #>> '{}'
               WHEN 'number' THEN btrim(v::text)
               WHEN 'boolean' THEN btrim(v::text)
               ELSE NULL
           END
$fn$;

-- CAST(<nvarchar> AS int): surrounding spaces allowed, optional sign, digits only; '' is 0.
CREATE OR REPLACE FUNCTION tsql_compat.to_int(t text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
BEGIN
    IF t IS NULL THEN
        RETURN NULL;
    ELSIF btrim(t, ' ') = '' THEN
        RETURN 0;
    ELSIF btrim(t, ' ') ~ '^[+-]?[0-9]+$' THEN
        RETURN btrim(t, ' ')::integer;   -- out of range raises, as SQL Server does
    END IF;
    RAISE EXCEPTION 'Conversion failed when converting the nvarchar value ''%'' to data type int.', t;
END;
$fn$;

-- CAST(<nvarchar> AS decimal(18,2)): surrounding spaces allowed, plain decimal notation only (no exponent), rounds half
-- away from zero to 2 places, at most 16 digits before the point.
CREATE OR REPLACE FUNCTION tsql_compat.to_decimal_18_2(t text)
RETURNS numeric(18,2)
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
    v numeric;
BEGIN
    IF t IS NULL THEN
        RETURN NULL;
    END IF;
    IF btrim(t, ' ') ~ '^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)$' THEN
        v := round(btrim(t, ' ')::numeric, 2);
        IF abs(v) >= 1e16 THEN
            RAISE EXCEPTION 'Arithmetic overflow error converting nvarchar to data type numeric.';
        END IF;
        RETURN v;
    END IF;
    RAISE EXCEPTION 'Error converting data type nvarchar to decimal.';
END;
$fn$;

-- CAST(<nvarchar> AS datetime2(7)) for the formats measured on SQL Server (language us_english, dateformat mdy):
--   yyyy-m-dThh:mm:ss[.fraction][Z|+hh:mm|-hh:mm]   (two-digit hour; seconds required; the offset is ignored)
--   yyyy-m-d h:mm[:ss[.fraction]]                   (space separator; seconds optional)
--   yyyy-m-d   yyyymmdd   m/d/yyyy                  (midnight)
--   ''                                              (1900-01-01 00:00:00)
-- Trailing spaces are ignored; leading spaces are an error. Anything else is an error.
CREATE OR REPLACE FUNCTION tsql_compat.to_datetime2(t text)
RETURNS timestamp
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
    s text;
    m text[];
BEGIN
    IF t IS NULL THEN
        RETURN NULL;
    END IF;
    s := rtrim(t, ' ');
    IF s = '' THEN
        RETURN timestamp '1900-01-01 00:00:00';
    END IF;
    m := regexp_match(s, '^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})T([0-9]{2}):([0-9]{2}):([0-9]{2})([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})?$');
    IF m IS NULL THEN
        m := regexp_match(s, '^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2}) ([0-9]{1,2}):([0-9]{2})(?::([0-9]{2})([.][0-9]+)?)?$');
    END IF;
    IF m IS NULL THEN
        m := regexp_match(s, '^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$');
    END IF;
    IF m IS NULL THEN
        m := regexp_match(s, '^([0-9]{4})([0-9]{2})([0-9]{2})$');
    END IF;
    IF m IS NULL THEN
        m := regexp_match(s, '^([0-9]{1,2})/([0-9]{1,2})/([0-9]{4})$');
        IF m IS NOT NULL THEN
            m := ARRAY[m[3], m[1], m[2]];   -- mdy
        END IF;
    END IF;
    IF m IS NULL OR coalesce(m[4], '0')::int > 23 THEN
        RAISE EXCEPTION 'Conversion failed when converting date and/or time from character string.';
    END IF;
    -- make_timestamp rejects impossible dates (2016-02-30); the fraction is rounded to microseconds
    RETURN make_timestamp(m[1]::int, m[2]::int, m[3]::int,
                          coalesce(m[4], '0')::int, coalesce(m[5], '0')::int,
                          coalesce(m[6], '0')::int + coalesce(('0' || m[7])::numeric, 0)::double precision);
END;
$fn$;

CREATE SCHEMA IF NOT EXISTS website;

CREATE OR REPLACE PROCEDURE website.record_vehicle_temperature(
    full_sensor_data_array text
)
LANGUAGE plpgsql
AS $fn$
DECLARE
    sensor_data text := left(full_sensor_data_array, 1000);   -- @FullSensorDataArray nvarchar(1000)
    crlf text := chr(13) || chr(10);
    help_message text;
    inserted integer;
BEGIN
    help_message := 'JSON sensor data is invalid. An example of what is required is as follows:' || crlf || crlf
        || '{"Recordings":' || crlf
        || '    [' || crlf
        || '        {"type":"Feature", "geometry": {"type":"Point", "coordinates":[-89.7600464,50.4742420] }, "properties":{"rego":"WWI-321-A","sensor":1,"when":"2016-01-01T07:00:00","temp":3.96}},' || crlf
        || '        {"type":"Feature", "geometry": {"type":"Point", "coordinates":[-89.7600464,50.4742420] }, "properties":{"rego":"WWI-321-A","sensor":2,"when":"2016-01-01T07:00:00","temp":3.98}}' || crlf
        || '    ]' || crlf
        || '}';

    IF tsql_compat.isjson(sensor_data) = 0 THEN
        RAISE NOTICE '%', help_message;
        RAISE EXCEPTION 'FullSensorDataArray must be valid JSON data' USING ERRCODE = 'P0001';
    END IF;

    BEGIN
        INSERT INTO warehouse.vehicle_temperatures
            ("VehicleRegistration", "ChillerSensorNumber", "RecordedWhen", "Temperature",
             "FullSensorData", "IsCompressed", "CompressedSensorData")
        SELECT left(tsql_compat.json_scalar(tsql_compat.json_path(e.value, ARRAY['properties', 'rego'])), 40),
               tsql_compat.to_int(tsql_compat.json_scalar(tsql_compat.json_path(e.value, ARRAY['properties', 'sensor']))),
               tsql_compat.to_datetime2(tsql_compat.json_scalar(tsql_compat.json_path(e.value, ARRAY['properties', 'when']))),
               tsql_compat.to_decimal_18_2(tsql_compat.json_scalar(tsql_compat.json_path(e.value, ARRAY['properties', 'temp']))),
               CASE WHEN e.from_array AND json_typeof(e.value) IN ('object', 'array') THEN e.value::text END,
               false,
               NULL
        FROM tsql_compat.openjson_with_rows(tsql_compat.json_member(sensor_data::json, 'Recordings')) AS e;
        GET DIAGNOSTICS inserted = ROW_COUNT;
        IF inserted = 0 THEN
            RAISE NOTICE 'Warning: No valid sensor data found';
            RAISE NOTICE '%', help_message;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '%', help_message;
        RAISE EXCEPTION 'Valid JSON was supplied but does not match the temperature recordings array structure' USING ERRCODE = 'P0001';
    END;
END;
$fn$;
