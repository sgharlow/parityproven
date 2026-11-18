/**
 * CLI: npm run mcp:setup — as sa, create (or re-key) the MCP server's login pp_mcp_reader and give its database user
 * SELECT on the access map's views and nothing else. Idempotent. Password: MCP_READER_PASSWORD in .env (never committed).
 */
import { existsSync, readFileSync } from "fs";
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
const LOGIN = "pp_mcp_reader";

async function main(): Promise<void> {
  const sa = process.env["MSSQL_SA_PASSWORD"];
  const pw = process.env["MCP_READER_PASSWORD"];
  if (!sa || !pw) throw new Error("MSSQL_SA_PASSWORD and MCP_READER_PASSWORD must be set in .env");
  const map = loadAccessMap(resolve(ROOT, "web", "data", "agent-access-map.json"));
  const pool = await new sql.ConnectionPool({ ...mssqlEndpoint(), user: "sa", password: sa, database: "master", options: { trustServerCertificate: true, encrypt: false } }).connect();
  try {
    // the password is bound as a parameter and quoted by QUOTENAME inside dynamic SQL (CREATE LOGIN takes no variables)
    await pool.request().input("pw", sql.NVarChar(128), pw).query(`
      DECLARE @q nvarchar(300) = QUOTENAME(@pw, '''');
      IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'${LOGIN}')
        EXEC (N'CREATE LOGIN [${LOGIN}] WITH PASSWORD = ' + @q + N', DEFAULT_DATABASE = [WideWorldImporters], CHECK_POLICY = ON');
      ELSE
        EXEC (N'ALTER LOGIN [${LOGIN}] WITH PASSWORD = ' + @q);`);
    const db = pool.request();
    await db.query(`USE [WideWorldImporters]; IF USER_ID(N'${LOGIN}') IS NULL CREATE USER [${LOGIN}] FOR LOGIN [${LOGIN}];`);
    for (const e of map.exposed) {
      const [s, v] = e.view.split(".");
      await pool.request().query(`USE [WideWorldImporters]; GRANT SELECT ON OBJECT::[${s}].[${v}] TO [${LOGIN}];`);
    }
    // row-level security roles: membership only changes which rows the database's policy shows. A role that holds any
    // permission is refused, so membership can never widen what the login may do.
    for (const role of map.controls.rowLevelRoles ?? []) {
      const r = await pool.request().input("r", sql.NVarChar(128), role).query(`USE [WideWorldImporters];
        SELECT (SELECT COUNT(*) FROM sys.database_permissions p WHERE p.grantee_principal_id = d.principal_id) AS perms,
               (SELECT COUNT(*) FROM sys.database_role_members m WHERE m.member_principal_id = d.principal_id) AS nested
        FROM sys.database_principals d WHERE d.name = @r AND d.type = 'R';`);
      const row = r.recordset[0];
      if (!row) throw new Error(`role [${role}] does not exist in WideWorldImporters`);
      if (row.perms > 0 || row.nested > 0) throw new Error(`role [${role}] holds ${row.perms} permission(s) or is a member of another role; refusing to add ${LOGIN} to it`);
      await pool.request().input("r", sql.NVarChar(128), role).query(`USE [WideWorldImporters];
        DECLARE @s nvarchar(400) = N'ALTER ROLE ' + QUOTENAME(@r) + N' ADD MEMBER [${LOGIN}]';
        IF IS_ROLEMEMBER(@r, N'${LOGIN}') = 0 EXEC (@s);`);
    }
    const perms = await pool.request().query(`USE [WideWorldImporters];
      SELECT p.permission_name, p.state_desc, SCHEMA_NAME(o.schema_id) + N'.' + o.name AS obj
      FROM sys.database_permissions p LEFT JOIN sys.objects o ON o.object_id = p.major_id
      WHERE p.grantee_principal_id = USER_ID(N'${LOGIN}') ORDER BY obj, p.permission_name;`);
    const roles = await pool.request().query(`USE [WideWorldImporters];
      SELECT r.name FROM sys.database_role_members m JOIN sys.database_principals r ON r.principal_id = m.role_principal_id
      WHERE m.member_principal_id = USER_ID(N'${LOGIN}');`);
    console.log(`${LOGIN}: permissions in WideWorldImporters:`);
    for (const r of perms.recordset) console.log(`  ${r.state_desc} ${r.permission_name} ${r.obj ?? "(database)"}`);
    console.log(`  role memberships: ${roles.recordset.map((r) => r.name).join(", ") || "none"}`);
  } finally {
    await pool.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
