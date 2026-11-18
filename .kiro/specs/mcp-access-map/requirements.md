# mcp-access-map requirements
**Scope item:** 6 (Agent Access Map prototype), back in scope by ruling R23 (2026-11-17, reversing R18 and M7B). Stop rule (owner, T1): working and pushed by 2026-11-29, otherwise cut (remove the page, keep the server out of the claims).
**Goal:** a read-only MCP server over public WideWorldImporters sample data, and a committed Agent Access Map rendered on the live site.

## Requirements
### REQ-1 Read-only by construction
1. The server connects as a dedicated login whose only permissions are SELECT on the views in the map, plus membership of row-level-security roles that hold no permissions.
2. No tool accepts SQL text. Each tool runs one fixed, parameterised query against one view; undeclared arguments are rejected by the protocol layer.

### REQ-2 Negative test
1. Run as the server's own login: every exposed view is readable and shows rows; INSERT, UPDATE and DELETE (on a base table and through a view), DDL, reading a base table and running a procedure are each refused with a permission error. Automated (`npm run mcp:check`); evidence in `evidence/mcp/readonly-check.txt`.
2. Unit tests cover the tool layer and the map's validation without a database.

### REQ-3 The map
1. A committed map (`web/data/agent-access-map.json`) covers the five items: entities and actions; the read-only views; authentication, row-level limits and audit; a risk rating per entity; the first use case with a P50/P90 effort range. Risk ratings and the effort range are labelled as judgments; no count is typed into it.
2. The server's tools and the live `/access-map` page both read that file. The page says the server is a local prototype over public sample data and recommends no vendor.

### REQ-4 Evidence of use
1. Each tool call is logged (time, MCP client, tool, arguments, row count; never row data) to `evidence/mcp/tool-calls.jsonl`.
2. The server is registered in the workspace's Kiro MCP configuration. Nothing says Kiro used MCP until a call whose client is Kiro is in the log.

### REQ-5 Data and dependencies
1. Data: the restored WideWorldImporters sample only (`sources-and-data.md`); nothing hosted; no row data committed.
2. Dependencies pinned exactly, with licences in `THIRD-PARTY-NOTICES.md`.
