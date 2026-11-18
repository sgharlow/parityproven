// MCP protocol smoke test: start the server over stdio with the SDK's own client, list its tools, call two of them.
//   npm run build && node scripts/mcp-smoke.mjs     (Docker stack up, npm run mcp:setup done)
// The calls are logged by the server like any other, with client "parityproven-smoke-test".
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = new Client({ name: "parityproven-smoke-test", version: "0.1.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(root, "dist", "mcp", "server.js")], cwd: root }));
const { tools } = await client.listTools();
console.log(`tools: ${tools.map((t) => t.name).join(", ")}`);
const r = await client.callTool({ name: "list_customers", arguments: { limit: 2 } });
const body = JSON.parse(r.content[0].text);
console.log(`list_customers(limit 2): ${body.rowCount} rows from ${body.view}`);
const bad = await client.callTool({ name: "list_customers", arguments: { limit: 2, sql: "DROP TABLE x" } });
console.log(`list_customers with an extra 'sql' argument: ${bad.isError ? "refused" : "ACCEPTED"} (${bad.content[0].text.slice(0, 90)})`);
await client.close();
process.exit(body.rowCount === 2 && bad.isError ? 0 : 1);
