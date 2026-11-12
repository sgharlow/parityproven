/**
 * Website.RecordVehicleTemperature (WideWorldImporters): validates a JSON document (ISJSON), shreds $.Recordings with
 * OPENJSON ... WITH, and inserts one Warehouse.VehicleTemperatures row per recording, inside TRY/CATCH + a transaction.
 * Every error becomes THROW 51000 and nothing is inserted.
 *
 * The generated documents use values whose SQL Server behaviour was measured on SQL Server 2025 at the database's
 * compatibility level 130 (2026-11-11, probes in the session log): which strings convert to datetime2 / int / decimal(18,2),
 * how nvarchar(40) truncates, how object and array values become NULL, duplicate keys (first wins), and AS JSON text.
 * Values outside that vocabulary (e.g. more than 6 fractional digits of a second) are not generated and not claimed.
 */

import * as fc from "fast-check";
import type { ColSpec, FixedCase, ObjectSpec } from "../harness/generic/spec.js";

const int = { kind: "int" } as const;
const bit = { kind: "bit" } as const;
const dt2 = { kind: "datetime2" } as const;
const vbin = { kind: "varbinary" } as const;
const nv = (n: number) => ({ kind: "nvarchar", n }) as const;
const dec = (p: number, s: number) => ({ kind: "decimal", p, s }) as const;

// JSON value literals (already serialised), grouped by property. "∅" = leave the property out.
const REGO = ['"WWI-321-A"', '"a"', '""', '"12345678901234567890"', '"123456789012345678901"', '"Café"', '"a\\u00e9\\n"', "5", "true", "1.50", "null", '{"x":1}', "∅"];
const SENSOR = ["1", "2", "-1", "0", '"2"', '" 3 "', '"+4"', '""', "1.5", "2.0", "true", "null", "2147483647", "2147483648", "-2147483648", "[1]", "∅"];
const WHEN = [
  '"2016-01-01T07:00:00"', '"2016-01-01T07:00:00.5"', '"2016-01-01T07:00:00.123456"', '"2016-01-01 07:00:00"', '"2016-01-01 07:00"',
  '"2016-01-01T07:00"', '"2016-01-01"', '"20160101"', '"1/2/2016"', '"13/01/2016"', '"2016-02-30T00:00:00"', '"2016-1-1T07:00:00"',
  '"2016-01-01T07:00:00Z"', '"2016-01-01T07:00:00+02:00"', '"2016-01-01T24:00:00"', '"2016-01-01T07:00:00 "', '" 2016-01-01T07:00:00 "',
  '"0001-01-01T00:00:00"', '"9999-12-31T23:59:59.999999"', '"x"', '""', "5", "null", "∅",
];
const TEMP = ["3.96", "3.965", "3.955", "-0.005", "0.005", "-1", '"4.5"', '" 2.5 "', '".5"', '"5."', '"+1"', "1.23456789", "1e2", '"abc"', '""', "true", "12345678.99", "123456789.12", "null", "∅"];

// valid-looking values, weighted up so that a useful share of documents is inserted rather than rejected
const GOOD = { rego: ['"WWI-321-A"', '"a"', '"Café"'], sensor: ["1", "2", '"2"'], when: ['"2016-01-01T07:00:00"', '"2016-01-01T07:00:00.5"', '"2016-01-01 07:00"'], temp: ["3.96", "3.965", '"4.5"'] };

const ws = fc.constantFrom("", "", " ", "  ", "\n");
const pick = (good: string[], all: string[]) => fc.oneof({ arbitrary: fc.constantFrom(...good), weight: 4 }, { arbitrary: fc.constantFrom(...all), weight: 1 });

const member = (k: string, v: string, w: string) => (v === "∅" ? null : `${w}"${k}"${w}:${w}${v}`);

/** One recording (GeoJSON-style feature, as the procedure's help text shows), with variable whitespace and key order. */
const featureArb = fc
  .record({
    rego: pick(GOOD.rego, REGO), sensor: pick(GOOD.sensor, SENSOR), when: pick(GOOD.when, WHEN), temp: pick(GOOD.temp, TEMP),
    w: ws, reorder: fc.boolean(), duplicateRego: fc.integer({ min: 0, max: 9 }),
  })
  .map(({ rego, sensor, when, temp, w, reorder, duplicateRego }) => {
    const props = [member("rego", rego, w), member("sensor", sensor, w), member("when", when, w), member("temp", temp, w)].filter((m): m is string => m !== null);
    if (reorder) props.reverse();
    if (duplicateRego === 0) props.push(`"rego":"second"`);   // duplicate key: SQL Server reads the first
    return `{${w}"type":"Feature",${w}"geometry":{"type":"Point","coordinates":[-89.76,50.47]},${w}"properties":{${props.join(",")}}${w}}`;
  });

const docArb: fc.Arbitrary<string | null> = fc.oneof(
  { arbitrary: fc.array(featureArb, { minLength: 1, maxLength: 3 }).map((fs) => `{"Recordings":[${fs.join(", ")}]}`), weight: 12 },
  { arbitrary: fc.constant('{"Recordings":[]}'), weight: 1 },
  { arbitrary: fc.array(featureArb, { minLength: 1, maxLength: 2 }).map((fs) => `{"Recordings":{${fs.map((f, i) => `"r${i}":${f}`).join(",")}}}`), weight: 1 },   // object of features: one row, the object itself
  { arbitrary: featureArb.map((f) => `{"Recordings":${f}}`), weight: 1 },   // a single feature object: one row, AS JSON is NULL
  { arbitrary: featureArb.map((f) => `{"Recordings":[${f}, 5, "s"]}`), weight: 1 },   // scalar elements: AS JSON is NULL
  { arbitrary: fc.constantFrom('{"Other":[]}', '{"recordings":[1]}', "[]", "[1,2]", '{"Recordings":5}'), weight: 1 },   // valid JSON, no recordings
  { arbitrary: fc.constantFrom("not json", "", "   ", "{", '{"Recordings":[', "1", '"x"', "null", '{"a":01}', '{"a":"tab\tx"}'), weight: 1 },   // ISJSON = 0
  { arbitrary: fc.constant(null), weight: 1 },   // ISJSON(NULL) is NULL: not rejected; no rows
  { arbitrary: featureArb.map((f) => `{"Recordings":[${f}],"pad":"${"x".repeat(990)}"}`), weight: 1 },   // over 1000 characters: truncated by nvarchar(1000)
);

export const VEHICLE_SPECS: ObjectSpec[] = [
  {
    database: "WideWorldImporters", schema: "Website", name: "RecordVehicleTemperature", objectClass: "procedure",
    windowParams: false, orderKey: [],
    pgFunction: "website.record_vehicle_temperature",
    params: [{ name: "FullSensorDataArray", type: nv(1000), arbitrary: docArb }],
    ssCall: "EXEC Website.RecordVehicleTemperature @FullSensorDataArray = ?",
    pgCall: "CALL {fn}($1::text)",
    tables: [{
      schema: "Warehouse", name: "VehicleTemperatures", rows: [0, 1],
      columns: [
        { name: "VehicleRegistration", type: nv(20), strings: ["WWI-1"] },
        { name: "ChillerSensorNumber", type: int },
        { name: "RecordedWhen", type: dt2 },
        { name: "Temperature", type: dec(10, 2) },
        { name: "FullSensorData", type: nv(1000), nullable: true, strings: ['{"x":1}'] },
        { name: "IsCompressed", type: bit },
        { name: "CompressedSensorData", type: vbin, nullable: true },
      ] satisfies ColSpec[],
    }],
    stateCheck: { tables: ["Warehouse.VehicleTemperatures"], sqlServerErrors: [51000], postgresErrors: ["P0001"] },
    fixedCases: fixedCases(),
    mutants: [
      { name: "parameter not truncated to nvarchar(1000)", from: "left(full_sensor_data_array, 1000)", to: "full_sensor_data_array" },
      { name: "ISJSON accepts JSON scalars", from: "value IS JSON OBJECT OR value IS JSON ARRAY", to: "value IS JSON" },
      { name: "duplicate keys: last one wins", from: "ORDER BY e.ord LIMIT 1", to: "ORDER BY e.ord DESC LIMIT 1" },
      { name: "empty string is not 1900-01-01", from: "RETURN timestamp '1900-01-01 00:00:00';", to: "RETURN NULL;" },
      { name: "decimal accepts exponent notation", from: "'^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)$'", to: "'^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)([eE][+-]?[0-9]+)?$'" },
      { name: "AS JSON fragment normalised (jsonb)", from: "e.value::text END", to: "e.value::jsonb::text END" },
      // Not a planted defect: dropping the nvarchar(40) truncation is unobservable, because any value longer than 40
      // characters is also longer than the column's 20 and is rejected either way (an equivalent mutant).
    ],
    notes: [
      "WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted.",
      "Converted to a PostgreSQL PROCEDURE. THROW 51000 becomes RAISE EXCEPTION (SQLSTATE P0001); PRINT becomes RAISE NOTICE. Step 3 is the state form: whether each engine raised, and every row of Warehouse.VehicleTemperatures.",
      "OPENJSON ... WITH is reproduced by tsql_compat helpers on the json type (not jsonb, which would normalise the AS JSON text): lax paths with the first duplicate key winning; object and array values read as NULL for scalar columns; nvarchar(40) truncation; an object at $.Recordings is one row (the object) whose '$' AS JSON is NULL; T-SQL string conversion rules for int, decimal(18,2) and datetime2 as measured on SQL Server 2025 at compatibility level 130.",
      "datetime2 strings: only the measured formats are generated (ISO with T and seconds, space-separated, date only, yyyymmdd, m/d/yyyy, empty string = 1900-01-01, time-zone suffix ignored). Values with more than 6 fractional digits are not generated: PostgreSQL timestamp holds microseconds.",
      "The scratch Warehouse.VehicleTemperatures is a disk-based table without the identity column (the procedure does not reference it). In the source it is memory-optimized; the procedure is interpreted T-SQL, so storage does not change its result.",
      "Step 4 is not run: the call changes the data it reads.",
    ],
  },
];

function fixedCases(): FixedCase[] {
  const doc = (props: string) => `{"Recordings":[{"type":"Feature","properties":{${props}}}]}`;
  const ok = '"rego":"WWI-1","sensor":1,"when":"2016-01-01T07:00:00","temp":3.96';
  const empty = { "Warehouse.VehicleTemperatures": [] };
  return [
    { label: "one valid recording", args: [doc(ok)], tables: empty },
    { label: "empty 'when' converts to 1900-01-01", args: [doc('"rego":"a","sensor":1,"when":"","temp":1')], tables: empty },
    { label: "temperature 3.965 rounds half away from zero to 3.97", args: [doc('"rego":"a","sensor":1,"when":"2016-01-01T07:00:00","temp":3.965')], tables: empty },
    { label: "temperature in exponent notation is rejected", args: [doc('"rego":"a","sensor":1,"when":"2016-01-01T07:00:00","temp":1e2')], tables: empty },
    { label: "registration of 21 characters does not fit nvarchar(20): rejected", args: [doc('"rego":"123456789012345678901","sensor":1,"when":"2016-01-01T07:00:00","temp":1')], tables: empty },
    { label: "duplicate key: the first value is used", args: [doc('"rego":"first","rego":"second","sensor":1,"when":"2016-01-01T07:00:00","temp":1')], tables: empty },
    { label: "a JSON scalar is not accepted by ISJSON", args: ["5"], tables: empty },
    { label: "NULL document: no error, nothing inserted", args: [null], tables: empty },
    { label: "over 1000 characters: the parameter is truncated, so the JSON becomes invalid", args: [`{"Recordings":[{"properties":{${ok}}}],"pad":"${"x".repeat(990)}"}`], tables: empty },
    { label: "AS JSON keeps the element's original whitespace", args: ['{"Recordings":[  {  "properties" : { "rego" : "a", "sensor" : 1, "when" : "2016-01-01", "temp" : 1 }  }  ]}'], tables: empty },
    { label: "date in m/d/yyyy form", args: [doc('"rego":"a","sensor":1,"when":"1/2/2016","temp":1')], tables: empty },
    { label: "hour without seconds after T is rejected", args: [doc('"rego":"a","sensor":1,"when":"2016-01-01T07:00","temp":1')], tables: empty },
  ];
}
