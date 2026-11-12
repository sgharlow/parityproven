-- PL/pgSQL conversion of Website.RecordColdRoomTemperatures (WideWorldImporters).
-- Engine: Kiro. No separate first draft was kept for this object.
--
-- Differences from a literal translation:
--  * NATIVE_COMPILATION, SCHEMABINDING, EXECUTE AS OWNER and BEGIN ATOMIC WITH (SNAPSHOT, LANGUAGE) have no PostgreSQL
--    equivalent. ATOMIC's all-or-nothing behaviour comes from the exception block (a subtransaction): an error undoes
--    every reading applied in this call.
--  * The table-valued parameter type Website.SensorDataList becomes the composite type website.sensor_data_list and the
--    parameter an array of it.
--  * SELECT @a = ... WHERE ... leaves the variables unchanged when no row matches (PL/pgSQL SELECT INTO would set them
--    to NULL), so the reading is fetched into a record and copied only when found.
--  * THROW 51000 -> RAISE EXCEPTION (SQLSTATE P0001).

CREATE SCHEMA IF NOT EXISTS website;

DO $do$
BEGIN
    CREATE TYPE website.sensor_data_list AS (
        "SensorDataListID"     integer,
        "ColdRoomSensorNumber" integer,
        "RecordedWhen"         timestamp,
        "Temperature"          numeric(18,2)
    );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END
$do$;

-- Build the parameter from a JSON array of readings (how the harness, or any client without composite-array support,
-- passes the readings; CALL arguments cannot contain subqueries).
CREATE OR REPLACE FUNCTION website.sensor_data_list_from_json(readings jsonb)
RETURNS website.sensor_data_list[]
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT coalesce(array_agg(jsonb_populate_record(NULL::website.sensor_data_list, r) ORDER BY ord), '{}')
    FROM jsonb_array_elements(readings) WITH ORDINALITY AS e(r, ord)
$fn$;

CREATE OR REPLACE PROCEDURE website.record_cold_room_temperatures(
    sensor_readings website.sensor_data_list[]
)
LANGUAGE plpgsql
AS $fn$
DECLARE
    number_of_readings      integer;
    counter                 integer;
    cold_room_sensor_number integer;
    recorded_when           timestamp;
    temperature             numeric(18,2);
    reading                 record;
BEGIN
    BEGIN
        SELECT max(r."SensorDataListID"), min(r."SensorDataListID")
        INTO number_of_readings, counter
        FROM unnest(sensor_readings) AS r;

        -- note that we cannot use a merge here because multiple readings might exist for each sensor
        WHILE counter <= number_of_readings LOOP
            SELECT r."ColdRoomSensorNumber", r."RecordedWhen", r."Temperature"
            INTO reading
            FROM unnest(sensor_readings) AS r
            WHERE r."SensorDataListID" = counter;
            IF FOUND THEN
                cold_room_sensor_number := reading."ColdRoomSensorNumber";
                recorded_when := reading."RecordedWhen";
                temperature := reading."Temperature";
            END IF;

            UPDATE warehouse.cold_room_temperatures
            SET "RecordedWhen" = recorded_when,
                "Temperature" = temperature
            WHERE "ColdRoomSensorNumber" = cold_room_sensor_number;

            IF NOT FOUND THEN
                INSERT INTO warehouse.cold_room_temperatures ("ColdRoomSensorNumber", "RecordedWhen", "Temperature")
                VALUES (cold_room_sensor_number, recorded_when, temperature);
            END IF;

            counter := counter + 1;
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Unable to apply the sensor data' USING ERRCODE = 'P0001';
    END;
END;
$fn$;
