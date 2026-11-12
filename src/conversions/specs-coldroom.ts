/**
 * Website.RecordColdRoomTemperatures (WideWorldImporters): natively compiled; walks a memory-optimized table-valued
 * parameter (Website.SensorDataList) by SensorDataListID and, per reading, updates every row for that cold-room sensor
 * or inserts one. Any error inside the ATOMIC block becomes THROW 51000 and the whole call is rolled back.
 *
 * Scratch modelling (recorded in the pair record):
 *  - Website.SensorDataList is memory-optimized with SensorDataListID as IDENTITY, as in the source. The harness fills a
 *    table variable of that type in T-SQL (one INSERT per reading), so SQL Server numbers the readings 1..n.
 *  - Warehouse.ColdRoomTemperatures is memory-optimized (SCHEMA_ONLY in the scratch database). The source table is also
 *    system-versioned and has an identity key; the procedure references neither, so neither is modelled.
 */

import type { ColSpec, FixedCase, ObjectSpec, Row } from "../harness/generic/spec.js";

const int = { kind: "int" } as const;
const dt2 = { kind: "datetime2" } as const;
const dec = (p: number, s: number) => ({ kind: "decimal", p, s }) as const;

// sensor numbers from a small range so readings update existing rows and each other
const sensor = (nullable: boolean): ColSpec => ({ name: "ColdRoomSensorNumber", type: int, nullable, range: [1, 4], special: [1, 2] });

export const COLDROOM_SPECS: ObjectSpec[] = [
  {
    database: "WideWorldImporters", schema: "Website", name: "RecordColdRoomTemperatures", objectClass: "procedure",
    windowParams: false, orderKey: [],
    pgFunction: "website.record_cold_room_temperatures",
    memoryOptimizedFilegroup: true,
    ssCall: "EXEC Website.RecordColdRoomTemperatures @SensorReadings = ?",
    // the readings arrive as a JSON array and become the conversion's composite-array parameter
    pgCall: "CALL {fn}(website.sensor_data_list_from_json($1::jsonb))",
    tables: [
      {
        schema: "Website", name: "SensorDataList", tvp: { argIndex: 0 }, memoryOptimized: {}, rows: [0, 5],
        columns: [
          { name: "SensorDataListID", type: int, role: "pk", identity: true },
          sensor(true),
          { name: "RecordedWhen", type: dt2, nullable: true },
          // decimal(18,2) in the parameter, decimal(10,2) in the table: large values overflow on write
          { name: "Temperature", type: dec(18, 2), nullable: true, special: [] },
        ],
      },
      {
        schema: "Warehouse", name: "ColdRoomTemperatures", memoryOptimized: { index: ["ColdRoomSensorNumber"] }, rows: [0, 3],
        columns: [sensor(false), { name: "RecordedWhen", type: dt2 }, { name: "Temperature", type: dec(10, 2) }],
      },
    ],
    stateCheck: { tables: ["Warehouse.ColdRoomTemperatures"], sqlServerErrors: [51000], postgresErrors: ["P0001"] },
    fixedCases: fixedCases(),
    mutants: [
      { name: "insert even when the update found rows", from: "IF NOT FOUND THEN", to: "IF true THEN" },
      { name: "loop bounds swapped (a call with several readings applies none)", from: "INTO number_of_readings, counter", to: "INTO counter, number_of_readings" },
      { name: "an error keeps the readings applied before it", from: "EXCEPTION WHEN OTHERS THEN", to: "EXCEPTION WHEN division_by_zero THEN" },
      { name: "update changes the temperature only", from: `SET "RecordedWhen" = recorded_when,\n                "Temperature" = temperature`, to: `SET "Temperature" = temperature` },
    ],
    notes: [
      "WITH NATIVE_COMPILATION, SCHEMABINDING, EXECUTE AS OWNER and BEGIN ATOMIC (SNAPSHOT, LANGUAGE English) have no PostgreSQL equivalent. The ATOMIC block's all-or-nothing behaviour is reproduced by a PL/pgSQL exception block (a subtransaction); THROW 51000 becomes RAISE EXCEPTION (SQLSTATE P0001).",
      "The table-valued parameter Website.SensorDataList becomes a composite type website.sensor_data_list and an array parameter. The harness passes the same generated readings to both engines.",
      "SELECT @a = ... WHERE SensorDataListID = @Counter leaves the variables unchanged when no row matches; the conversion keeps the previous values in that case too (it cannot happen with identity-assigned IDs, which have no gaps).",
      "Scratch modelling: the SQL Server call fills a table variable of Website.SensorDataList (memory-optimized, SensorDataListID IDENTITY as in the source) one INSERT per reading, so the readings are numbered 1..n; PostgreSQL receives the same readings with the same numbers. Warehouse.ColdRoomTemperatures is memory-optimized but not system-versioned and has no identity key; the procedure references neither.",
      "Step 3 is the state form: whether each engine raised, and every row of Warehouse.ColdRoomTemperatures (compared as a multiset; the table has no key the procedure uses).",
    ],
  },
];

function fixedCases(): FixedCase[] {
  const reading = (id: number, s: number | null, when: string | null, t: string | null): Row => ({ SensorDataListID: id, ColdRoomSensorNumber: s, RecordedWhen: when, Temperature: t });
  const W1 = "2020-01-01T00:00:00.000000";
  const W2 = "2020-01-01T00:00:05.123456";
  return [
    {
      label: "two readings for the same new sensor: the first inserts, the second updates it",
      args: [], tables: { "Website.SensorDataList": [reading(1, 3, W1, "4.00"), reading(2, 3, W2, "4.50")], "Warehouse.ColdRoomTemperatures": [] },
    },
    {
      label: "a reading updates every existing row for its sensor",
      args: [],
      tables: {
        "Website.SensorDataList": [reading(1, 1, W2, "5.25")],
        "Warehouse.ColdRoomTemperatures": [{ ColdRoomSensorNumber: 1, RecordedWhen: W1, Temperature: "1.00" }, { ColdRoomSensorNumber: 1, RecordedWhen: W1, Temperature: "2.00" }],
      },
    },
    {
      label: "a NULL sensor number in the second reading: everything is rolled back, including the first reading",
      args: [], tables: { "Website.SensorDataList": [reading(1, 2, W1, "3.00"), reading(2, null, W1, "3.00")], "Warehouse.ColdRoomTemperatures": [] },
    },
    {
      label: "a temperature that overflows decimal(10,2): rolled back",
      args: [], tables: { "Website.SensorDataList": [reading(1, 2, W1, "123456789.00")], "Warehouse.ColdRoomTemperatures": [] },
    },
    { label: "no readings: nothing changes", args: [], tables: { "Website.SensorDataList": [], "Warehouse.ColdRoomTemperatures": [{ ColdRoomSensorNumber: 4, RecordedWhen: W1, Temperature: "1.00" }] } },
  ];
}
