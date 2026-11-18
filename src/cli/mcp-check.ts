/**
 * CLI: npm run mcp:check — the negative test for the MCP server's login, run AS that login (pp_mcp_reader).
 *  - every view in the access map can be read
 *  - INSERT, UPDATE, DELETE (on a base table and on a view), DDL, reading a base table and running a procedure are each
 *    refused by the database with a permission error
 * Every attempt runs inside a transaction that is always rolled back, so even an unexpected success changes nothing.
 * Output: evidence/mcp/readonly-check.txt. Exit 1 unless every read succeeds and every write is refused.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import sql from "mssql";
import { loadAccessMap } from "../mcp/access-map.js";
import { mssqlEndpoint } from "../harness/endpoints.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envFile = resolve(ROOT, ".env");
if (existsSync(envFile)) for (const line of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m?.[1] && m[2] !== undefined) process.env[m[1].trim()] = m[2].trim();
}

/** SQL Server permission errors: 229 (object permission denied), 262 (statement permission denied, e.g. CREATE TABLE). */
const PERMISSION_ERRORS = [229, 262, 300];
const errNumber = (e: unknown): number | undefined =>
  (e as { number?: number }).number ?? (e as { originalError?: { info?: { number?: number } } }).originalError?.info?.number;

export const WRITE_ATTEMPTS: Array<{ what: string; sql: string }> = [
  { what: "INSERT into a base table (Sales.Customers)", sql: "INSERT INTO Sales.Customers (CustomerName) VALUES (N'pp_mcp_probe')" },
  { what: "UPDATE a base table (Sales.Customers)", sql: "UPDATE Sales.Customers SET CustomerName = CustomerName WHERE 1 = 0" },
  { what: "DELETE from a base table (Sales.Customers)", sql: "DELETE FROM Sales.Customers WHERE 1 = 0" },
  { what: "UPDATE through an exposed view (Website.Suppliers)", sql: "UPDATE Website.Suppliers SET SupplierName = SupplierName WHERE 1 = 0" },
  // a single-table view: on a multi-table view (Website.Customers) SQL Server reports "not updatable" (4405) before it
  // checks permissions, which proves nothing about permissions (seen 2026-11-18)
  { what: "DELETE through an exposed view (Website.VehicleTemperatures)", sql: "DELETE FROM Website.VehicleTemperatures WHERE 1 = 0" },
  { what: "DDL: CREATE TABLE", sql: "CREATE TABLE dbo.pp_mcp_probe (i int)" },
  { what: "DDL: CREATE VIEW", sql: "EXEC (N'CREATE VIEW dbo.pp_mcp_probe_v AS SELECT 1 AS i')" },
  { what: "read a base table directly (Sales.Customers)", sql: "SELECT TOP (1) CustomerID FROM Sales.Customers" },
  { what: "run a procedure (Website.SearchForCustomers)", sql: "EXEC Website.SearchForCustomers @SearchText = N'a', @MaximumRowsToReturn = 1" },
];

async function attempt(pool: sql.ConnectionPool, text: string): Promise<{ ok: boolean; error?: number; message?: string; rows?: number }> {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const r = await new sql.Request(tx).query(text);
    return { ok: true, rows: r.recordset?.length ?? r.rowsAffected?.[0] ?? 0 };
  } catch (e) {
    return { ok: false, error: errNumber(e), message: (e as Error).message };
  } finally {
    await tx.rollback().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const pw = process.env["MCP_READER_PASSWORD"];
  if (!pw) throw new Error("MCP_READER_PASSWORD must be set in .env (and npm run mcp:setup run once)");
  const map = loadAccessMap(resolve(ROOT, "web", "data", "agent-access-map.json"));
  const pool = await new sql.ConnectionPool({ ...mssqlEndpoint(), user: "pp_mcp_reader", password: pw, database: "WideWorldImporters", options: { trustServerCertificate: true, encrypt: false } }).connect();
  const lines: string[] = [`MCP reader negative test, run as pp_mcp_reader on WideWorldImporters, ${new Date().toISOString()}`];
  let ok = true;
  try {
    const who = await pool.request().query("SELECT SUSER_SNAME() AS login, USER_NAME() AS db_user");
    lines.push(`connected as login ${who.recordset[0].login}, database user ${who.recordset[0].db_user}`);
    for (const role of map.controls.rowLevelRoles ?? []) {
      const m = await pool.request().input("r", sql.NVarChar(128), role).query("SELECT IS_ROLEMEMBER(@r) AS m");
      if (m.recordset[0].m !== 1) ok = false;   // without it the database's row-level policy shows no customers
      lines.push(`row-level security role [${role}]: ${m.recordset[0].m === 1 ? "member" : "NOT a member (run npm run mcp:setup)"}`);
    }
    lines.push("reads (each view in the access map; must succeed):");
    for (const e of map.exposed) {
      const r = await attempt(pool, `SELECT COUNT(*) AS n FROM ${e.view}`);
      const n = r.ok ? (await pool.request().query(`SELECT COUNT(*) AS n FROM ${e.view}`)).recordset[0].n : undefined;
      // a view the login can read but sees no rows of is a tool that cannot work (seen 2026-11-18: row-level security)
      const usable = r.ok && Number(n) > 0;
      if (!usable) ok = false;
      lines.push(`  ${usable ? "READ OK " : r.ok ? "NO ROWS VISIBLE" : "READ FAILED"} ${e.view}${r.ok ? ` (${n} rows visible to this login)` : `: error ${r.error} ${r.message}`}`);
    }
    lines.push("writes and other access (must each be refused with a permission error):");
    for (const w of WRITE_ATTEMPTS) {
      const r = await attempt(pool, w.sql);
      const refused = !r.ok && r.error !== undefined && PERMISSION_ERRORS.includes(r.error);
      if (!refused) ok = false;
      lines.push(`  ${refused ? "REFUSED " : r.ok ? "ALLOWED!" : "OTHER ERROR"} ${w.what}${r.ok ? " (rolled back)" : `: error ${r.error} ${(r.message ?? "").slice(0, 160)}`}`);
    }
  } finally {
    await pool.close();
  }
  lines.push(ok ? "RESULT: PASS — every view is readable and every write, DDL, base-table read and procedure call was refused" : "RESULT: FAIL");
  const out = resolve(ROOT, "evidence", "mcp", "readonly-check.txt");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join("\n") + "\n", "utf-8");
  console.log(lines.join("\n"));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
