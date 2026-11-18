/**
 * ParityProven MCP server (local prototype): read-only tools over the restored WideWorldImporters sample on SQL Server.
 *
 *   npm run build && npm run mcp:setup   # once, as sa: the reader login and its grants
 *   node dist/mcp/server.js              # stdio; started by an MCP client (Kiro: .kiro/settings/mcp.json)
 *
 * Read-only by construction: it connects as pp_mcp_reader, whose only permissions are SELECT on the views in the access
 * map, and every tool runs one fixed parameterised query (src/mcp/tools.ts). Each call is appended to
 * evidence/mcp/tool-calls.log (time, tool, arguments, row count; never row data). Nothing is written to stdout except the
 * MCP protocol.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import sql from "mssql";
import { loadAccessMap } from "./access-map.js";
import { describeMap, runTool, type ToolQuery } from "./tools.js";
import { mssqlEndpoint } from "../harness/endpoints.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envFile = resolve(ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m?.[1] && m[2] !== undefined && process.env[m[1].trim()] === undefined) process.env[m[1].trim()] = m[2].trim();
  }
}

export const READER_LOGIN = "pp_mcp_reader";
const LOG = resolve(ROOT, "evidence", "mcp", "tool-calls.log");
const map = loadAccessMap(resolve(ROOT, "web", "data", "agent-access-map.json"));

function audit(entry: Record<string, unknown>): void {
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    // the client is the one named in the MCP handshake (e.g. Kiro, or the smoke test), so a reader can tell the uses apart
    const client = server.server.getClientVersion();
    appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), client: client ? `${client.name} ${client.version}` : "unknown", ...entry }) + "\n", "utf-8");
  } catch (e) {
    console.error(`audit log write failed: ${(e as Error).message}`);
  }
}

let pool: sql.ConnectionPool | undefined;
async function query(q: ToolQuery): Promise<Array<Record<string, unknown>>> {
  const password = process.env["MCP_READER_PASSWORD"];
  if (!password) throw new Error("MCP_READER_PASSWORD is not set (.env); run npm run mcp:setup first");
  pool ??= await new sql.ConnectionPool({
    ...mssqlEndpoint(), user: READER_LOGIN, password, database: "WideWorldImporters",
    options: { trustServerCertificate: true, encrypt: false },
  }).connect();
  const req = pool.request();
  for (const [k, v] of Object.entries(q.params)) req.input(k, typeof v === "number" ? sql.Int : sql.NVarChar(200), v);
  return (await req.query(q.text)).recordset as Array<Record<string, unknown>>;
}

const server = new McpServer({ name: "parityproven-wwi-readonly", version: "0.1.0" });

server.registerTool("describe_access_map", {
  title: "Describe the Agent Access Map",
  description: "What an agent may read from WideWorldImporters through this server, how, and what it may not. Returns no data rows.",
  inputSchema: {},
}, async () => {
  audit({ tool: "describe_access_map", args: {}, rowCount: 0 });
  return { content: [{ type: "text" as const, text: describeMap(map) }] };
});

for (const e of map.exposed) {
  const shape: Record<string, z.ZodTypeAny> = { limit: z.number().int().min(1).max(e.maxRows).optional().describe(`Rows to return, 1 to ${e.maxRows} (default ${e.maxRows})`) };
  for (const f of e.filters) shape[f.name] = z.string().max(200).optional().describe(f.description);
  server.registerTool(e.tool, {
    title: `Read ${e.entity}`,
    description: `${e.actions.join("; ")}. Reads the view ${e.view} (read-only), at most ${e.maxRows} rows, ordered by ${e.orderBy}.`,
    // strict: an undeclared argument is an error, not silently dropped (a raw shape strips unknown keys; seen 2026-11-18)
    inputSchema: z.object(shape).strict(),
  }, async (args: Record<string, unknown>) => {
    try {
      const r = await runTool(map, e.tool, args, query);
      audit(r.audit);
      return { content: [{ type: "text" as const, text: JSON.stringify({ view: e.view, rowCount: r.rows.length, rows: r.rows }) }] };
    } catch (err) {
      audit({ tool: e.tool, args, error: (err as Error).message });
      return { isError: true, content: [{ type: "text" as const, text: (err as Error).message }] };
    }
  });
}

await server.connect(new StdioServerTransport());
console.error(`parityproven-wwi-readonly: ${map.exposed.length} read-only tools over ${map.system}; audit log ${LOG}`);
