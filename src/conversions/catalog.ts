/**
 * Build an ObjectSpec's tables from catalog/<db>/<Schema.Name>.json (written by `npm run scaffold`
 * from SQL Server's own metadata). Removes hand transcription of column lists and types.
 *
 * Roles:
 *   single-column primary key  -> pk  (unique 1..n; for text keys "K1".."Kn")
 *   foreign-key column         -> ref (drawn from the shared key universe; text keys "K1".."Kk")
 *   composite primary key      -> its foreign-key columns are ref, the rest plain values
 * `overrides` can force a role (e.g. make a history table's ProductID unique so "SELECT @x = ..."
 * has at most one matching row, a documented precondition of those functions).
 */

import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { ColSpec, ColType, ObjectSpec, TableSpec } from "../harness/generic/spec.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface CatalogCol { name: string; sqlType: string; nullable: boolean; isPk: boolean; isFk: boolean }
interface CatalogTable { schema: string; name: string; objectType: string; columns: CatalogCol[] }
interface CatalogFile { object: string; type: string; tables?: CatalogTable[]; error?: string }

export function mapType(sqlType: string): ColType {
  const t = sqlType.toLowerCase();
  let m: RegExpMatchArray | null;
  if (t === "int") return { kind: "int" };
  if (t === "smallint") return { kind: "smallint" };
  if (t === "tinyint") return { kind: "tinyint" };
  if (t === "bigint") return { kind: "bigint" };
  if (t === "bit") return { kind: "bit" };
  if (t === "money") return { kind: "money" };
  if (t === "datetime") return { kind: "datetime" };
  if (t === "date") return { kind: "date" };
  if (t.startsWith("datetime2")) return { kind: "datetime2" };
  if ((m = t.match(/^(?:decimal|numeric)\((\d+),(\d+)\)$/))) return { kind: "decimal", p: Number(m[1]), s: Number(m[2]) };
  if ((m = t.match(/^(?:nvarchar|varchar)\((\d+|max)\)$/))) return { kind: "nvarchar", n: m[1] === "max" ? 200 : Number(m[1]) };
  if ((m = t.match(/^(?:nchar|char)\((\d+)\)$/))) return { kind: "char", n: Number(m[1]) };
  if (t === "geography") return { kind: "geography" };
  if (t === "xml") return { kind: "xml" };
  throw new Error(`unsupported column type "${sqlType}"`);
}

export interface CatalogOptions {
  /** Force a column role: { "Production.ProductListPriceHistory.ProductID": "pk" } */
  roles?: Record<string, "pk" | "ref" | "value">;
  /** Replace a column's generation bounds: { "Schema.Table.Column": { range: [0, 255] } } */
  columns?: Record<string, Partial<Pick<ColSpec, "range" | "special" | "nullable" | "nullFraction">>>;
  /** Row count [min, max] for every table (default: about the key-universe size, occasionally empty). */
  rows?: [number, number];
}

export function tablesFromCatalog(database: string, qualified: string, opts: CatalogOptions = {}): TableSpec[] {
  const p = resolve(ROOT, "catalog", database, `${qualified}.json`);
  if (!existsSync(p)) throw new Error(`no catalog for ${qualified}; run: npm run scaffold -- --database ${database} --object ${qualified}`);
  const cat = JSON.parse(readFileSync(p, "utf-8")) as CatalogFile;
  if (cat.error) throw new Error(`catalog for ${qualified} has no column list: ${cat.error}`);
  const nonBase = (cat.tables ?? []).filter((t) => t.objectType !== "U");
  if (nonBase.length) {
    throw new Error(`${qualified} references non-table objects (${nonBase.map((t) => `${t.schema}.${t.name}:${t.objectType}`).join(", ")}); convert those first or model them by hand`);
  }

  return (cat.tables ?? []).map((t) => {
    const pkCount = t.columns.filter((c) => c.isPk).length;
    const columns: ColSpec[] = t.columns.map((c) => {
      const type = mapType(c.sqlType);
      const key = `${t.schema}.${t.name}.${c.name}`;
      const forced = opts.roles?.[key];
      let role: ColSpec["role"];
      if (forced) role = forced === "value" ? undefined : forced;
      else if (c.isPk && pkCount === 1) role = "pk";
      else if (c.isFk) role = "ref";
      // pk/ref only make sense for keys we can enumerate: integers and short text codes
      if (role && !(type.kind === "int" || type.kind === "smallint" || type.kind === "tinyint" || type.kind === "bigint" || type.kind === "nvarchar" || type.kind === "char")) role = undefined;
      const extra = opts.columns?.[key] ?? {};
      return { name: c.name, type, nullable: extra.nullable ?? c.nullable, role, range: extra.range, special: extra.special, nullFraction: extra.nullFraction };
    });
    return { schema: t.schema, name: t.name, columns, ...(opts.rows ? { rows: opts.rows } : {}) };
  });
}

/** Spec skeleton for a catalogued object; callers add the call, order key, mutants and fixed cases. */
export function specFromCatalog(
  database: string,
  qualified: string,
  rest: Omit<ObjectSpec, "database" | "schema" | "name" | "tables" | "objectClass" | "windowParams"> & { windowParams?: boolean },
  opts: CatalogOptions = {}
): ObjectSpec {
  const p = resolve(ROOT, "catalog", database, `${qualified}.json`);
  const cat = JSON.parse(readFileSync(p, "utf-8")) as CatalogFile;
  const [schema, name] = qualified.split(".");
  const objectClass: ObjectSpec["objectClass"] =
    cat.type === "V" ? "view" : cat.type === "P" ? "procedure" : cat.type === "TR" ? "trigger" : "function";
  return { database, schema, name, objectClass, windowParams: false, tables: tablesFromCatalog(database, qualified, opts), ...rest };
}
