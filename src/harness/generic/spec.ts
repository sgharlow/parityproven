/**
 * Spec-driven harness types.
 * One ObjectSpec describes the tables an object reads; the same spec generates the
 * SQL Server and PostgreSQL DDL, the generated data, and the property run.
 * Only the columns the object actually references are declared.
 */

import type { ObjectClass } from "../../pairs/schema.js";
import type { Arbitrary } from "fast-check";

export type ColType =
  | { kind: "int" }
  | { kind: "tinyint" }
  | { kind: "smallint" }
  | { kind: "bigint" }
  /** SQL Server money (4 decimal places) <-> numeric(19,4); not PostgreSQL's locale-dependent money type. */
  | { kind: "money" }
  /** SQL Server datetime (rounds to .000/.003/.007) <-> timestamp(3). Generated values are ones datetime can represent. */
  | { kind: "datetime" }
  | { kind: "char"; n: number }
  | { kind: "decimal"; p: number; s: number }
  | { kind: "nvarchar"; n: number }
  | { kind: "date" }
  | { kind: "datetime2" }
  | { kind: "bit" }
  /** SQL Server geography (points, SRID 4326) <-> PostGIS geography. Compared as well-known text. */
  | { kind: "geography" }
  /** SQL Server varbinary(max) <-> bytea. Compared byte for byte. */
  | { kind: "varbinary" };

export interface ColSpec {
  name: string;
  type: ColType;
  nullable?: boolean;
  /**
   * pk: unique sequential 1..n (PRIMARY KEY). ref: small-domain int (1..4) so joins hit.
   * seq: unique sequential `offset+1..offset+n` with no key constraint; for columns that are unique by the
   * object's precondition (e.g. a person is the contact of at most one customer) so a join cannot fan out.
   */
  role?: "pk" | "ref" | "seq";
  /** First value of a `seq` column is offset + 1. */
  offset?: number;
  /** Inclusive bounds for integer columns/arguments (e.g. a tinyint status, or the full int range). */
  range?: [number, number];
  /** Extra values always mixed in (boundaries such as 0, -1, the int limits). */
  special?: number[];
  /** int IDENTITY(1,1) on SQL Server; generated values are ignored (rows are numbered 1..n in generated order). */
  identity?: boolean;
  /** Extra text values mixed in for nvarchar columns/arguments (names, search terms, LIKE metacharacters). */
  strings?: string[];
  /**
   * Make every value in the column distinct (a row-number digit is appended). Use for a sort key whose tie order the
   * source leaves undefined and whose rows cannot be compared as a multiset (e.g. rows inside one JSON document).
   */
  distinct?: boolean;
  /** bit columns: probability of true (default 0.5). */
  trueFraction?: number;
  /** Nullable columns: probability of NULL (default about 0.2). */
  nullFraction?: number;
  /** A purpose-built generator for this column or argument (e.g. structured JSON text). Replaces the type's default. */
  arbitrary?: Arbitrary<unknown>;
}

export interface TableSpec {
  schema: string;
  name: string;
  columns: ColSpec[];
  /** Override the generated row count [min, max] (default: about the key-universe size). */
  rows?: [number, number];
  /**
   * A table-valued parameter, not a table. SQL Server: `CREATE TYPE <schema>.<name> AS TABLE`, passed as argument
   * `argIndex` (inserted into the call arguments at that position). PostgreSQL: the generated rows are passed as one
   * JSON array (text) at the same position; the conversion's pgCall turns it into its own parameter type.
   */
  tvp?: { argIndex: number };
  /**
   * SQL Server memory-optimized table or table type (needs ObjectSpec.memoryOptimizedFilegroup). A `pk` column becomes
   * PRIMARY KEY NONCLUSTERED; `index` columns get a NONCLUSTERED index. Tables are DURABILITY = SCHEMA_ONLY in the scratch
   * database. PostgreSQL gets an ordinary table.
   */
  memoryOptimized?: { index?: string[] };
}

/**
 * For objects that change data instead of returning it (verification step 3, state form): after the same call on both
 * engines, the outcome (completed, or raised one of the declared errors) and the full contents of these tables must match.
 * Any other error is a harness failure, not an outcome.
 */
export interface StateCheck {
  /** "Schema.Table" keys of spec tables to compare after the call. */
  tables: string[];
  /** SQL Server error numbers that count as the object's own error outcome (e.g. THROW 51000). */
  sqlServerErrors: number[];
  /** PostgreSQL SQLSTATE codes that count as the conversion's error outcome (e.g. P0001 for RAISE EXCEPTION). */
  postgresErrors: string[];
  /**
   * Extra observations after the call, for state that is not table rows (e.g. the next value a sequence issues).
   * Each pair of queries returns one result set per engine; they are compared like the tables.
   */
  queries?: Array<{ label: string; sqlServer: string; postgres: string }>;
  /**
   * Named error classes. When set, the outcome is "raised: <label>" and both engines must raise the same class
   * (e.g. NULL into a NOT NULL column = SQL Server 515 / PostgreSQL 23502). The plain lists above still count as "raised".
   */
  errorClasses?: Array<{ label: string; sqlServer: number[]; postgres: string[] }>;
}

/** Statements run on each engine after a sample's rows are loaded and before the call (e.g. create sequences at generated values). */
export type SampleSetup = (data: { args?: unknown[]; tables: Record<string, Row[]> }) => { sqlServer: string[]; postgres: string[] };

export type Row = Record<string, unknown>;

export interface Mutant {
  name: string;
  /** Exact text in the final PL/pgSQL to replace. Must occur in the file. */
  from: string;
  to: string;
}

export interface FixedCase {
  label: string;
  cutoffs?: { last: string; new: string };   // µs-normalised ISO strings
  args?: unknown[];                          // call arguments (scalar functions)
  tables: Record<string, Row[]>;             // keyed "Schema.Table"
}

/** A miss we know about before running: the conversion cannot be equivalent, and says why. */
export interface KnownLimitation {
  /** Output column the PostgreSQL side cannot reproduce. */
  column: string;
  reason: string;
}

export interface ObjectSpec {
  database: string;
  schema: string;
  name: string;
  objectClass: ObjectClass;
  tables: TableSpec[];
  /** Procedure takes (@LastCutoff, @NewCutoff). */
  windowParams: boolean;
  /** Output columns the source ORDER BY guarantees. [] = no guaranteed order. */
  orderKey: string[];
  /** Schema-qualified PostgreSQL function name, e.g. integration.get_order_updates */
  pgFunction: string;
  /** Call arguments (scalar functions). Generated from the same key universe as the tables. */
  params?: ColSpec[];
  /** Override the default call. SQL Server uses ? placeholders; PostgreSQL uses $n and {fn} for the function name. */
  ssCall?: string;
  pgCall?: string;
  /** Set-based statements for the runtime measurement (scalar functions: call once per row of a volume table). {fn} = PostgreSQL function. */
  benchSs?: string;
  benchPg?: string;
  /** Rows per table for the runtime step when the default is too heavy for the object (e.g. row-by-row scalar functions). */
  benchVolume?: number;
  /**
   * Output columns that hold a JSON document. Both sides are parsed and compared as values: whitespace and number
   * formatting are ignored; key order, array order, nulls and string values are not.
   */
  jsonColumns?: string[];
  /**
   * The SQL Server side is a FOR JSON query, which the server streams as several rows of one column (about 2,000
   * characters each). The harness joins them, in arrival order, into one value in a column named "result".
   */
  forJsonChunks?: boolean;
  /** The object changes data: compare outcome and table state instead of a result set. Step 4 is not run. */
  stateCheck?: StateCheck;
  /** The scratch database gets a MEMORY_OPTIMIZED_DATA filegroup (memory-optimized tables, types, native compilation). */
  memoryOptimizedFilegroup?: boolean;
  /**
   * Objects this one calls ("Schema.Name"). SQL Server: their original definitions are read from the source database and
   * deployed (unchanged) first. PostgreSQL: their verified conversions (conversions/<db>/<Schema.Name>.sql) are deployed first.
   */
  dependencies?: string[];
  /** Statements run once after the tables are created and before the object is deployed (e.g. CREATE SEQUENCE). */
  setup?: { sqlServer: string[]; postgres: string[] };
  /**
   * Adjust generated data before it is loaded (both engines get the same adjusted data), to satisfy a precondition
   * random data almost never meets, e.g. a stored password hash that matches one of the generated passwords.
   */
  prepare?: (data: { args?: unknown[]; tables: Record<string, Row[]> }) => void;
  /** Per-sample setup that is not table rows. Generated values reach it through data.tables (harness-only tables) or args. */
  sampleSetup?: SampleSetup;
  /**
   * Coverage rule for state checks: does this sample exercise the object's main path? Default: the call completed.
   * Used only to count coverage (the vacuity guard), never to decide equivalence.
   */
  informativeData?: (data: { args?: unknown[]; tables: Record<string, Row[]> }) => boolean;
  /** Set when the object is known not to convert cleanly; a failing run is then recorded as a failed pair, not discarded. */
  knownLimitation?: KnownLimitation;
  /** Hand-derived trap inputs that always run before the random samples. */
  fixedCases?: FixedCase[];
  /** Each mutant of the final conversion must be detected as FAILING. */
  mutants: Mutant[];
  notes?: string[];
}

export const tableKey = (t: { schema: string; name: string }): string => `${t.schema}.${t.name}`;

export const snake = (s: string): string =>
  s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

export const pgTableName = (t: { schema: string; name: string }): string =>
  `${t.schema.toLowerCase()}.${snake(t.name)}`;

export function sqlServerType(t: ColType): string {
  switch (t.kind) {
    case "int": return "int";
    case "tinyint": return "tinyint";
    case "smallint": return "smallint";
    case "bigint": return "bigint";
    case "money": return "money";
    case "datetime": return "datetime";
    case "char": return `char(${t.n})`;
    case "decimal": return `decimal(${t.p},${t.s})`;
    case "nvarchar": return `nvarchar(${t.n})`;
    case "date": return "date";
    case "datetime2": return "datetime2(7)";
    case "bit": return "bit";
    case "geography": return "geography";
    case "varbinary": return "varbinary(max)";
  }
}

export function postgresType(t: ColType): string {
  switch (t.kind) {
    case "int": return "integer";
    case "tinyint": return "smallint";      // PostgreSQL has no 1-byte integer; range 0..255 is enforced by the generator
    case "smallint": return "smallint";
    case "bigint": return "bigint";
    case "money": return "numeric(19,4)";
    case "datetime": return "timestamp(3)";
    case "char": return `char(${t.n})`;
    case "decimal": return `numeric(${t.p},${t.s})`;
    case "nvarchar": return `varchar(${t.n})`;
    case "date": return "date";
    case "datetime2": return "timestamp";   // microsecond precision: 100 ns ticks are not representable
    case "bit": return "boolean";
    case "geography": return "geography";   // PostGIS (SRID 4326)
    case "varbinary": return "bytea";
  }
}

export function sqlServerDdl(t: TableSpec): string {
  const cols = t.columns.map(
    (c) => `  [${c.name}] ${sqlServerType(c.type)}${c.identity ? " IDENTITY(1,1)" : ""} ${c.nullable ? "NULL" : "NOT NULL"}`
  );
  const pk = t.columns.filter((c) => c.role === "pk").map((c) => `[${c.name}]`);
  const mo = t.memoryOptimized;
  if (pk.length) cols.push(`  PRIMARY KEY ${mo ? "NONCLUSTERED " : ""}(${pk.join(", ")})`);
  if (mo?.index?.length) cols.push(`  INDEX [ix_${t.name}_${mo.index.join("_")}] NONCLUSTERED (${mo.index.map((c) => `[${c}]`).join(", ")})`);
  const head = t.tvp ? `CREATE TYPE [${t.schema}].[${t.name}] AS TABLE` : `CREATE TABLE [${t.schema}].[${t.name}]`;
  const options = mo ? (t.tvp ? " WITH (MEMORY_OPTIMIZED = ON)" : " WITH (MEMORY_OPTIMIZED = ON, DURABILITY = SCHEMA_ONLY)") : "";
  return `${head} (\n${cols.join(",\n")}\n)${options}`;
}

export function postgresDdl(t: TableSpec): string {
  const cols = t.columns.map(
    (c) => `  "${c.name}" ${postgresType(c.type)}${c.identity ? " GENERATED BY DEFAULT AS IDENTITY" : ""}${c.nullable ? "" : " NOT NULL"}`
  );
  const pk = t.columns.filter((c) => c.role === "pk").map((c) => `"${c.name}"`);
  if (pk.length) cols.push(`  PRIMARY KEY (${pk.join(", ")})`);
  return `CREATE TABLE ${pgTableName(t)} (\n${cols.join(",\n")}\n)`;
}

/** Column-type mappings actually used by an object, for the pair record. */
export function mappingsFor(spec: ObjectSpec): Array<{ sqlServerType: string; postgresType: string; notes?: string }> {
  const seen = new Map<string, { sqlServerType: string; postgresType: string; notes?: string }>();
  for (const t of spec.tables) {
    for (const c of t.columns) {
      const ss = sqlServerType(c.type) + (c.nullable ? " NULL" : " NOT NULL");
      if (seen.has(ss)) continue;
      const m = { sqlServerType: ss, postgresType: postgresType(c.type) + (c.nullable ? "" : " NOT NULL") } as {
        sqlServerType: string; postgresType: string; notes?: string;
      };
      if (c.type.kind === "datetime2") {
        m.notes = "datetime2(7) holds 100 ns ticks; PostgreSQL timestamp holds 1 µs. Harness inputs are normalised to µs and the count of normalised values is recorded as a finding.";
      }
      if (c.type.kind === "bit") m.notes = "bit maps to boolean; the driver returns true/false on both sides.";
      if (c.type.kind === "tinyint") m.notes = "PostgreSQL has no tinyint; smallint holds it, so out-of-range values (>255, <0) are not rejected the way SQL Server rejects them.";
      if (c.type.kind === "money") m.notes = "money -> numeric(19,4), not PostgreSQL's locale-dependent money type. Money arithmetic rounds to 4 places on SQL Server.";
      if (c.type.kind === "datetime") m.notes = "datetime rounds to .000/.003/.007 s on SQL Server; timestamp(3) does not. Only SQL Server-representable values are generated, and results are compared at microsecond resolution.";
      if (c.type.kind === "geography") m.notes = "SQL Server geography maps to PostGIS geography (SRID 4326). Only point values are generated and compared, as well-known text.";
      seen.set(ss, m);
    }
  }
  return [...seen.values()];
}
