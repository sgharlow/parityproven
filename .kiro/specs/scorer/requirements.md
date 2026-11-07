# scorer requirements

**Scope item:** 1 — Complexity scorer (KIROWEEN-PLAN.md).  
**Goal:** inventory and tier every programmable object in WideWorldImporters and AdventureWorks2025, producing a denominator for the migration scorecard and a tiered list that drives the predictions.

Sources: steering `pair-records.md` (tier rules), `structure.md` (repo layout), `sources-and-data.md`, `tech.md`.  
Object counts are the denominator for the scorecard. **Re-derive them live from `sys.objects`; never copy from a past session.**

---

## Requirements

### REQ-1 Object inventory query

**User story:** As the CLI, I can query a live SQL Server database and retrieve every non-system programmable object with its name, schema, type, and definition.

**Acceptance criteria:**
1. The query targets `sys.objects` with `is_ms_shipped = 0` and type in `('P', 'FN', 'IF', 'TF', 'V', 'TR')` — procedures, scalar/inline/table-valued functions, views, and triggers.
2. For each object, the query returns: `schema_name`, `object_name`, `object_type` (`procedure` | `function` | `view` | `trigger`), and the full T-SQL definition via `sys.sql_modules.definition`.
3. The query runs through the existing `MssqlClient` (no new database dependency).
4. Results are returned as a typed array matching the `InventoryItem` interface defined in `src/inventory/types.ts`.

---

### REQ-2 Complexity tier classification

**User story:** As the scorer, I classify each object into a complexity tier using the rules from `pair-records.md`, so predictions and effort estimates are consistent with the pair records.

**Acceptance criteria:**
1. Tier rules are implemented **once** in `src/inventory/tier.ts` and imported everywhere else (CLI, receipts builder, pair records). No other file re-implements them.
2. The rules (from `pair-records.md`):
   - **complex**: uses dynamic SQL (`EXEC(@sql)`, `sp_executesql`), cursors, CLR, cross-database references, linked servers, `OPENQUERY`/`OPENROWSET`, `xp_` procedures.
   - **medium**: uses temp tables or table variables (`#`, `##`, `DECLARE @t TABLE`), `MERGE`, `TRY/CATCH` with transactions, window functions (`OVER (`), `OUTPUT` clauses, multiple result sets.
   - **simple**: everything else.
3. Tier is determined by pattern-matching the object's T-SQL definition text (case-insensitive). An object matches the first tier whose patterns fire; complex is checked first, then medium, then simple.
4. The function signature is `classifyTier(definition: string): Tier` where `Tier = 'simple' | 'medium' | 'complex'`.
5. Tier rules have unit tests in `src/inventory/tier.test.ts` covering at least one positive and one negative case per pattern.

---

### REQ-3 Object-type classification

**User story:** As the scorer, I map SQL Server object type codes to the `objectClass` vocabulary used in pair records.

**Acceptance criteria:**
1. Type mapping is implemented in `src/inventory/types.ts`:
   - `'P'` → `'procedure'`
   - `'FN'`, `'IF'`, `'TF'` → `'function'`
   - `'V'` → `'view'`
   - `'TR'` → `'trigger'`
2. The `ObjectClass` type is the same type imported by `src/pairs/schema.ts` — defined once, re-exported.

---

### REQ-4 Inventory CLI command

**User story:** As a developer, I can run `npm run inventory -- --database <name>` to inventory a live database and write a JSON report.

**Acceptance criteria:**
1. The command connects to SQL Server using env vars (`MSSQL_SA_PASSWORD`, SQL Server host/port defaulting to `localhost:1433`).
2. It accepts `--database <name>` (required) and `--out <path>` (optional; defaults to `inventory/<database>.json`).
3. The output file is a JSON document matching the `InventoryReport` interface:
   ```ts
   interface InventoryReport {
     database: string;
     generatedAt: string;       // ISO timestamp
     counts: {
       procedure: { simple: number; medium: number; complex: number; total: number };
       function:  { simple: number; medium: number; complex: number; total: number };
       view:      { simple: number; medium: number; complex: number; total: number };
       trigger:   { simple: number; medium: number; complex: number; total: number };
       total:     number;
     };
     objects: InventoryItem[];
   }
   ```
4. After writing the file, the command prints a summary table to stdout:

   ```
   WideWorldImporters inventory
   ────────────────────────────────────────
   Type         Simple  Medium  Complex  Total
   procedure       N       N       N       N
   function        N       N       N       N
   view            N       N       N       N
   trigger         N       N       N       N
   TOTAL           N       N       N       N
   ────────────────────────────────────────
   ```
5. The command exits 0 on success and non-zero if the database is unreachable or the query fails.

---

### REQ-5 Counts match the measured denominator

**User story:** As the scorecard, I can verify that the inventory counts match the measured values from `KIROWEEN-PLAN.md`.

**Acceptance criteria:**
1. After running against the restored WideWorldImporters, the totals must match:
   - procedures: 42, functions: 2, views: 3, triggers: 0, total: 47
2. After running against AdventureWorks2025, the totals must match:
   - procedures: 10, functions: 11, views: 20, triggers: 10, total: 51
3. If the live counts differ from these expected values, the command prints a warning: `WARNING: counts differ from plan denominator — re-check sys.objects query`. It does **not** exit non-zero; the live count is authoritative.
4. Expected values are defined as constants in `src/inventory/expected-counts.ts` so they can be updated without touching business logic.

---

### REQ-6 AdventureWorks2025 restore

**User story:** As the harness, I can restore AdventureWorks2025 alongside WideWorldImporters so the scorer can inventory both databases.

**Acceptance criteria:**
1. `sources/manifest.json` gains a second entry for AdventureWorks2025:
   - repo: `microsoft/sql-server-samples`
   - release: the pinned release tag (look up from the GitHub releases page)
   - sha256: the measured value from `KIROWEEN-PLAN.md` (prefix `fa6a2a5d…` — full hash to be confirmed at intake)
   - license: MIT (re-confirmed at intake)
2. `src/harness/restore.ts` is extended (or a new `restoreAdventureWorks` function added) to restore `AdventureWorks2025.bak` the same way WideWorldImporters is restored.
3. The restore succeeds and the database is ONLINE at compatibility level 170 (SQL Server 2025).

---

## Out of scope for this spec

- Predictions (committed separately before any conversion run — that is the next step after this spec).
- The conversion loop, pair records, receipts UI, tSQLt/pgTAP, MCP.
- Any scoring of individual objects beyond tier classification (effort estimation lives in the predictions spec).
