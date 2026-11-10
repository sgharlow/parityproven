/**
 * Spec-driven harness types.
 * One ObjectSpec describes the tables an object reads; the same spec generates the
 * SQL Server and PostgreSQL DDL, the generated data, and the property run.
 * Only the columns the object actually references are declared.
 */

import type { ObjectClass } from "../../pairs/schema.js";

export type ColType =
  | { kind: "int" }
  | { kind: "decimal"; p: number; s: number }
  | { kind: "nvarchar"; n: number }
  | { kind: "date" }
  | { kind: "datetime2" }
  | { kind: "bit" }
  /** SQL Server spatial type. PostgreSQL has no built-in equivalent (PostGIS is not installed); the column is always NULL in generated data. */
  | { kind: "geography" };

export interface ColSpec {
  name: string;
  type: ColType;
  nullable?: boolean;
  /** pk: unique sequential 1..n. ref: small-domain int (1..4) so joins hit. */
  role?: "pk" | "ref";
}

export interface TableSpec {
  schema: string;
  name: string;
  columns: ColSpec[];
}

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
    case "decimal": return `decimal(${t.p},${t.s})`;
    case "nvarchar": return `nvarchar(${t.n})`;
    case "date": return "date";
    case "datetime2": return "datetime2(7)";
    case "bit": return "bit";
    case "geography": return "geography";
  }
}

export function postgresType(t: ColType): string {
  switch (t.kind) {
    case "int": return "integer";
    case "decimal": return `numeric(${t.p},${t.s})`;
    case "nvarchar": return `varchar(${t.n})`;
    case "date": return "date";
    case "datetime2": return "timestamp";   // microsecond precision: 100 ns ticks are not representable
    case "bit": return "boolean";
    case "geography": return "text";   // stand-in so the table exists; no spatial semantics
  }
}

export function sqlServerDdl(t: TableSpec): string {
  const cols = t.columns.map(
    (c) => `  [${c.name}] ${sqlServerType(c.type)} ${c.nullable ? "NULL" : "NOT NULL"}`
  );
  const pk = t.columns.filter((c) => c.role === "pk").map((c) => `[${c.name}]`);
  if (pk.length) cols.push(`  PRIMARY KEY (${pk.join(", ")})`);
  return `CREATE TABLE [${t.schema}].[${t.name}] (\n${cols.join(",\n")}\n)`;
}

export function postgresDdl(t: TableSpec): string {
  const cols = t.columns.map(
    (c) => `  "${c.name}" ${postgresType(c.type)}${c.nullable ? "" : " NOT NULL"}`
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
      if (c.type.kind === "geography") m.notes = "NO EQUIVALENT: PostgreSQL needs PostGIS (geography), which is not in the pinned postgres:18 image. A text stand-in column holds NULL only.";
      seen.set(ss, m);
    }
  }
  return [...seen.values()];
}
