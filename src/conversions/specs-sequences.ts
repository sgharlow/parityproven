/**
 * Sequences.ReseedSequenceBeyondTableValues (WideWorldImporters): reads a sequence's current value from sys.sequences,
 * reads MAX(column) of a table through dynamic SQL, and restarts the sequence above it when needed.
 * Kept in scope as the dynamic-SQL proof point (decision 2B, 2026-11-11).
 *
 * Step 3, state form: the observed state is the next value each sequence issues after the call (one query per engine).
 * Each sample recreates the sequences at generated start values, optionally consumes some values first, then calls.
 *
 * SQL Server semantics measured on SQL Server 2025 (2026-11-11): sys.sequences.current_value is the start value before
 * first use, the last value issued after use, and the restart value after RESTART WITH. In PostgreSQL that is the
 * sequence relation's last_value column (pg_sequences.last_value is NULL after a restart).
 */

import type { ColSpec, FixedCase, ObjectSpec, Row } from "../harness/generic/spec.js";

const int = { kind: "int" } as const;
const nv = (n: number) => ({ kind: "nvarchar", n }) as const;

/** Sequence -> the table column the procedure is asked to stay above (as Sequences.ReseedAllSequences calls it). */
const TARGETS: Record<string, [string, string, string]> = {
  OrderID: ["Sales", "Orders", "OrderID"],
  StockItemID: ["Warehouse", "StockItems", "StockItemID"],
  NoSuchSequence: ["Sales", "Orders", "OrderID"],   // the lookup finds nothing: no change on either engine
};
const SEQUENCES = ["OrderID", "StockItemID"];
/** Own keys only: a generated name such as "valueOf" must not resolve through the object prototype. */
const target = (seq: string): [string, string, string] => (Object.hasOwn(TARGETS, seq) ? TARGETS[seq] : TARGETS.NoSuchSequence);
const START = "Harness.SequenceStart";

const valueCol = (name: string): ColSpec => ({ name, type: int, nullable: true, range: [-5, 40], special: [0, 1, 5, 6, 39, 40] });

function maxOf(rows: Row[] | undefined, col: string): number {
  const vals = (rows ?? []).map((r) => r[col]).filter((v): v is number => typeof v === "number");
  return vals.length ? Math.max(...vals) : 0;   // COALESCE(MAX(col), 0)
}

/** The sequence's current_value as SQL Server reports it, from the generated start and the number of values consumed. */
function currentValue(start: number, used: number): number {
  return used > 0 ? start + used - 1 : start;
}

export const SEQUENCE_SPECS: ObjectSpec[] = [
  {
    database: "WideWorldImporters", schema: "Sequences", name: "ReseedSequenceBeyondTableValues", objectClass: "procedure",
    windowParams: false, orderKey: [],
    pgFunction: "sequences.reseed_sequence_beyond_table_values",
    params: [
      // the generated value is kept only when Harness.SequenceStart.Pick says so (an arbitrary, nonexistent name); see prepare
      { name: "SequenceName", type: nv(128) },
      { name: "SchemaName", type: nv(128), strings: ["Sales"] },
      { name: "TableName", type: nv(128), strings: ["Orders"] },
      { name: "ColumnName", type: nv(128), strings: ["OrderID"] },
    ],
    ssCall: "EXEC Sequences.ReseedSequenceBeyondTableValues @SequenceName = ?, @SchemaName = ?, @TableName = ?, @ColumnName = ?",
    pgCall: "CALL {fn}($1::text, $2::text, $3::text, $4::text)",
    tables: [
      // the column values are not keys: MAX over them, with NULLs and empty tables, is what the procedure reads
      // empty tables are covered by a fixed case; random samples have 1-4 rows
      { schema: "Sales", name: "Orders", columns: [{ name: "Id", type: int, role: "pk" }, valueCol("OrderID")], rows: [1, 4] },
      { schema: "Warehouse", name: "StockItems", columns: [{ name: "Id", type: int, role: "pk" }, valueCol("StockItemID")], rows: [1, 4] },
      // harness-only: the generated start value and the number of values consumed before the call, per sequence
      {
        schema: "Harness", name: "SequenceStart", rows: [2, 2],
        columns: [
          { name: "Id", type: int, role: "pk" },
          { name: "SequenceName", type: nv(128), strings: SEQUENCES },
          // mostly below the table values' range top, so both branches (reseed / leave alone) are common
          { name: "StartValue", type: int, range: [-3, 15], special: [0, 1, 5, 6] },
          { name: "Used", type: int, range: [0, 3], special: [0, 1, 2] },
          // which sequence the call names: 0-7 a real one, 8 "NoSuchSequence", 9 the arbitrary generated string
          { name: "Pick", type: int, range: [0, 9] },
        ],
      },
    ],
    // consistent arguments for the chosen sequence; one start row per sequence
    prepare: (d) => {
      const rows = d.tables[START] ?? [];
      rows.forEach((r, i) => { r.SequenceName = SEQUENCES[i]; });
      const pick = Number(rows[0]?.Pick ?? 0);
      if (d.args) {
        if (pick <= 7) d.args[0] = SEQUENCES[pick % 2];
        else if (pick === 8) d.args[0] = "NoSuchSequence";
        const [schema, table, column] = target(String(d.args[0]));
        d.args[1] = schema; d.args[2] = table; d.args[3] = column;
      }
    },
    sampleSetup: (d) => {
      const ss: string[] = [];
      const pg: string[] = [];
      for (const r of d.tables[START] ?? []) {
        const name = String(r.SequenceName);
        const start = Number(r.StartValue);
        const used = Number(r.Used);
        ss.push(`IF OBJECT_ID(N'Sequences.${name}', N'SO') IS NOT NULL DROP SEQUENCE Sequences.[${name}]`);
        ss.push(`CREATE SEQUENCE Sequences.[${name}] AS int START WITH ${start} MINVALUE -2147483648`);
        pg.push(`CREATE SCHEMA IF NOT EXISTS sequences`);
        pg.push(`DROP SEQUENCE IF EXISTS sequences."${name}"`);
        pg.push(`CREATE SEQUENCE sequences."${name}" AS integer START WITH ${start} MINVALUE -2147483648`);
        for (let i = 0; i < used; i++) {
          ss.push(`DECLARE @v int = NEXT VALUE FOR Sequences.[${name}]`);
          pg.push(`SELECT nextval('sequences."${name}"')`);
        }
      }
      return { sqlServer: ss, postgres: pg };
    },
    stateCheck: {
      tables: [],
      sqlServerErrors: [],
      postgresErrors: [],
      queries: [{
        label: "next value of each sequence after the call",
        sqlServer: `SELECT NEXT VALUE FOR Sequences.OrderID AS OrderID, NEXT VALUE FOR Sequences.StockItemID AS StockItemID`,
        postgres: `SELECT nextval('sequences."OrderID"') AS "OrderID", nextval('sequences."StockItemID"') AS "StockItemID"`,
      }],
    },
    // coverage: the sample reaches the ALTER SEQUENCE branch (table maximum >= the sequence's current value)
    informativeData: (d) => {
      const seq = String(d.args?.[0]);
      const start = (d.tables[START] ?? []).find((r) => r.SequenceName === seq);
      if (!start) return false;
      const [schema, table, column] = target(seq);
      return maxOf(d.tables[`${schema}.${table}`], column) >= currentValue(Number(start.StartValue), Number(start.Used));
    },
    fixedCases: fixedCases(),
    mutants: [
      { name: "reads pg_sequences.last_value (NULL after a restart or before first use)", from: `EXECUTE format('SELECT last_value FROM sequences.%I', sequence_name)`, to: `EXECUTE format('SELECT last_value FROM pg_sequences WHERE schemaname = ''sequences'' AND sequencename = %L', sequence_name)` },
      { name: "strictly greater instead of >=", from: `current_table_maximum_value >= current_sequence_maximum_value`, to: `current_table_maximum_value > current_sequence_maximum_value` },
      { name: "restarts at the maximum instead of maximum + 1", from: `new_sequence_value := current_table_maximum_value + 1;`, to: `new_sequence_value := current_table_maximum_value;` },
      { name: "empty table maximum NULL instead of 0", from: `SELECT COALESCE(MAX(%I), 0) FROM %I.%I`, to: `SELECT MAX(%I) FROM %I.%I` },
    ],
    notes: [
      "Dynamic SQL: EXECUTE (@SQL) with QUOTENAME becomes PL/pgSQL EXECUTE format() with %I. The #CurrentValue temp table that carries MAX() out of the dynamic statement becomes EXECUTE ... INTO.",
      "Identifier mapping follows this project's PostgreSQL naming: schema lower case, table snake_case, column and sequence names quoted as in SQL Server. The source resolves names case-insensitively (CI collation); the PostgreSQL version needs the names in their declared case. Only correctly cased names are generated, so case-insensitive name resolution is not claimed.",
      "sys.sequences.current_value maps to the sequence relation's last_value (measured: start value before first use, last value issued after use, restart value after RESTART WITH).",
      "Step 3 is the state form: the next value each sequence issues after the call is compared. Sequences are recreated per sample at generated start values, with 0-3 values consumed first.",
      "Harness-only table Harness.SequenceStart carries the generated sequence start values; the object does not read it.",
    ],
  },
];

function fixedCases(): FixedCase[] {
  const starts = (order: [number, number], stock: [number, number] = [1, 0]): Row[] => [
    { Id: 1, SequenceName: "OrderID", StartValue: order[0], Used: order[1], Pick: 0 },
    { Id: 2, SequenceName: "StockItemID", StartValue: stock[0], Used: stock[1], Pick: 0 },
  ];
  const orders = (vals: Array<number | null>): Row[] => vals.map((v, i) => ({ Id: i + 1, OrderID: v }));
  const base = (vals: Array<number | null>, order: [number, number]): Record<string, Row[]> => ({
    "Sales.Orders": orders(vals), "Warehouse.StockItems": [], [START]: starts(order),
  });
  const call = ["OrderID", "Sales", "Orders", "OrderID"];
  return [
    { label: "table maximum equals the unused sequence's start value: restart at maximum + 1", args: call, tables: base([3, 10], [10, 0]) },
    { label: "table maximum below the current value: no change", args: call, tables: base([3, 9], [10, 0]) },
    { label: "sequence used twice (current value = start + 1)", args: call, tables: base([11], [10, 2]) },
    { label: "empty table: MAX is NULL, COALESCE gives 0", args: call, tables: base([], [0, 0]) },
    { label: "only NULL values: MAX ignores NULLs", args: call, tables: base([null, null], [-1, 0]) },
    { label: "negative values and a negative start", args: call, tables: base([-2, -5], [-3, 0]) },
    { label: "unknown sequence: nothing changes", args: ["NoSuchSequence", "Sales", "Orders", "OrderID"], tables: base([100], [1, 0]) },
  ];
}
