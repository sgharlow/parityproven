/**
 * CLI: npm run scaffold -- --database AdventureWorks2025 [--object Schema.Name | --type V|FN|IF|TF|P|TR]
 *
 * Reads an object's T-SQL definition and, from SQL Server's own catalog, the tables and
 * columns it references (sys.dm_sql_referenced_entities), their types, nullability, primary
 * keys and foreign keys. Writes:
 *   .tmp/scaffold/<db>/<Schema.Name>.sql    the original definition (for reading)
 *   .tmp/scaffold/<db>/<Schema.Name>.json   a draft ObjectSpec: tables, columns, roles
 * Nothing here is committed. The PostgreSQL conversion and the final spec are still written
 * and reviewed by hand; this only removes the transcription work (and transcription errors).
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { MssqlClient } from "../harness/clients/mssql-client.js";
import { mssqlEndpoint } from "../harness/endpoints.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

const envFile = resolve(ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m?.[1] && m[2] !== undefined) process.env[m[1].trim()] = m[2].trim();
  }
}
const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(n);
  return i === -1 ? undefined : process.argv[i + 1];
};

interface Col { name: string; sqlType: string; nullable: boolean; isPk: boolean; isFk: boolean }

async function main(): Promise<void> {
  const database = arg("--database");
  if (!database) throw new Error("--database required");
  const sa = process.env["MSSQL_SA_PASSWORD"]!;
  const c = new MssqlClient({ ...mssqlEndpoint(), user: "sa", password: sa, database });
  const outDir = resolve(ROOT, ".tmp", "scaffold", database);          // definitions: for reading only
  const catalogDir = resolve(ROOT, "catalog", database);                // catalog facts: committed, reproducible
  mkdirSync(outDir, { recursive: true });
  mkdirSync(catalogDir, { recursive: true });

  try {
    const only = arg("--object");
    const type = arg("--type");
    const list = await c.query(
      `SELECT SCHEMA_NAME(o.schema_id) AS s, o.name AS n, RTRIM(o.type) AS t FROM sys.objects o
       WHERE o.is_ms_shipped = 0 AND o.type IN ('P','FN','IF','TF','V','TR')
         ${only ? `AND SCHEMA_NAME(o.schema_id) + '.' + o.name = '${only.replace(/'/g, "''")}'` : ""}
         ${type ? `AND RTRIM(o.type) = '${type.replace(/'/g, "''")}'` : ""}
       ORDER BY o.type, SCHEMA_NAME(o.schema_id), o.name`,
      []
    );

    for (const [schema, name, code] of list.rows as Array<[string, string, string]>) {
      const q = `${schema}.${name}`;
      const def = await c.query(`SELECT definition AS d FROM sys.sql_modules WHERE object_id = OBJECT_ID('${q}')`, []);
      writeFileSync(resolve(outDir, `${q}.sql`), String(def.rows[0]?.[0] ?? ""), "utf-8");

      // referenced columns (the object, not its callers)
      let refs;
      try {
        refs = await c.query(
          `SELECT DISTINCT referenced_schema_name, referenced_entity_name, referenced_minor_name
           FROM sys.dm_sql_referenced_entities('${q}', 'OBJECT')
           WHERE referenced_minor_name IS NOT NULL`,
          []
        );
      } catch (e) {
        writeFileSync(resolve(catalogDir, `${q}.json`), JSON.stringify({ object: q, type: code, error: (e as Error).message }, null, 2));
        console.log(`${code} ${q}: referenced entities unavailable (${(e as Error).message.split("\n")[0]})`);
        continue;
      }

      const tables = new Map<string, Set<string>>();
      for (const [s, t, col] of refs.rows as Array<[string, string, string]>) {
        if (!s) continue;
        const key = `${s}.${t}`;
        if (!tables.has(key)) tables.set(key, new Set());
        tables.get(key)!.add(col);
      }

      const specTables = [];
      for (const [key, cols] of tables) {
        const [s, t] = key.split(".");
        // is it a base table? (views/functions referenced by the object are reported, not expanded)
        const kind = await c.query(`SELECT RTRIM(type) AS k FROM sys.objects WHERE object_id = OBJECT_ID('[${s}].[${t}]')`, []);
        const tcode = String(kind.rows[0]?.[0] ?? "?");
        const info = await c.query(
          `SELECT col.name AS c0,
                  CASE WHEN ty.is_user_defined = 1 THEN TYPE_NAME(ty.system_type_id) ELSE ty.name END AS c1,
                  col.max_length AS c2, col.precision AS c3, col.scale AS c4, col.is_nullable AS c5,
                  CASE WHEN EXISTS (SELECT 1 FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                                    WHERE i.object_id = col.object_id AND i.is_primary_key = 1 AND ic.column_id = col.column_id) THEN 1 ELSE 0 END AS c6,
                  CASE WHEN EXISTS (SELECT 1 FROM sys.foreign_key_columns fkc WHERE fkc.parent_object_id = col.object_id AND fkc.parent_column_id = col.column_id) THEN 1 ELSE 0 END AS c7
           FROM sys.columns col JOIN sys.types ty ON ty.user_type_id = col.user_type_id
           WHERE col.object_id = OBJECT_ID('[${s}].[${t}]') AND col.name IN (${[...cols].map((x) => `'${x.replace(/'/g, "''")}'`).join(",")})
           ORDER BY col.column_id`,
          []
        );
        const columns: Col[] = (info.rows as unknown[][]).map((r) => {
          const base = String(r[1]);
          const len = Number(r[2]);
          const sqlType =
            base === "nvarchar" || base === "varchar" || base === "nchar" || base === "char"
              ? `${base}(${len === -1 ? "max" : base.startsWith("n") ? len / 2 : len})`
              : base === "decimal" || base === "numeric" ? `${base}(${r[3]},${r[4]})`
              : base === "datetime2" ? `datetime2(${r[4]})`
              : base;
          return { name: String(r[0]), sqlType, nullable: Boolean(r[5]), isPk: Number(r[6]) === 1, isFk: Number(r[7]) === 1 };
        });
        specTables.push({ schema: s, name: t, objectType: tcode, columns });
      }
      writeFileSync(resolve(catalogDir, `${q}.json`), JSON.stringify({ object: q, type: code, tables: specTables }, null, 2) + "\n", "utf-8");
      const unsupported = specTables.flatMap((t) => t.columns.filter((x) => /^(xml|hierarchyid|geometry|sql_variant|varbinary\(max\)|image|text|ntext|uniqueidentifier)/i.test(x.sqlType)).map((x) => `${t.name}.${x.name}:${x.sqlType}`));
      console.log(`${code} ${q}: ${specTables.length} table(s), ${specTables.reduce((n, t) => n + t.columns.length, 0)} column(s)${unsupported.length ? "  [types needing a decision: " + unsupported.join(", ") + "]" : ""}`);
    }
  } finally {
    await c.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
