# mcp-access-map design

## Data source
The restored WideWorldImporters database on SQL Server (public sample, pinned release asset). Not the PostgreSQL target: the harness's target tables hold no persistent rows (each run clears them), so there is nothing there for an agent to read.

## Login and permissions (`npm run mcp:setup`, as sa)
- Login and user `pp_mcp_reader`; password `MCP_READER_PASSWORD` in `.env`, bound as a parameter and quoted with QUOTENAME inside dynamic SQL (CREATE LOGIN takes no variables).
- `GRANT SELECT` on each view in the map; nothing else. Ownership chaining lets the views read their base tables, which the login cannot read directly.
- Row-level security: WideWorldImporters' own policy `Application.FilterCustomersBySalesTerritoryRole` shows a login only the customers of the "<territory> Sales" roles it belongs to. Measured 2026-11-18: without a role the login saw 0 customers; the nine territory roles hold no permissions. The map names one role (`controls.rowLevelRoles`); setup adds the login to it and refuses a role that holds any permission or is itself a member of another role. Visible counts are measured by `mcp:check`, not typed.

## Tools (`src/mcp/tools.ts`, `src/mcp/server.ts`)
- One tool per exposed entity, plus `describe_access_map` (returns the map, no rows).
- Query text is fixed per tool: `SELECT TOP (@limit) <columns> FROM <view> WHERE (@f_x IS NULL OR <column> = @f_x) ... ORDER BY <key>`. Identifiers come from the map and are validated as plain identifiers; values are bound parameters.
- Arguments: the declared filters and `limit` (1..maxRows). The MCP input schema is a strict zod object: an undeclared argument is a protocol error. (A raw shape strips unknown keys silently; the smoke test caught that on 2026-11-18.)
- SDK `@modelcontextprotocol/sdk` 1.32.2, stdio transport. Nothing but the protocol is written to stdout.

## Negative test (`npm run mcp:check`, as pp_mcp_reader)
Each attempt runs in a transaction that is always rolled back. A refusal counts only if it is a permission error (229, 262, 300): a DELETE through the multi-table `Website.Customers` view failed with 4405 ("not updatable") before any permission check, which proves nothing, so that attempt uses the single-table `Website.VehicleTemperatures` view. A view that is readable but shows no rows fails the check (a tool over it could not work).

## The page
`web/access-map.html` + `web/access-map.js` render `web/data/agent-access-map.json`; counts on the page are computed from the file. `site:check` follows the scorecard's nav link to the page, renders it with its script and requires every tool in the map to appear.

## Evidence of use
`evidence/mcp/tool-calls.jsonl` records the MCP client from the handshake (`server.getClientVersion()`), so the smoke test (`scripts/mcp-smoke.mjs`, client "parityproven-smoke-test") and a call from Kiro are told apart.
