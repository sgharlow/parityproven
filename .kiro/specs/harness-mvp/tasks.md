# harness-mvp tasks

> Status checked against the code and git history on 2026-11-12 (decision M5A): every task below is done or superseded; superseded tasks say what replaced them.

Implements `design.md`. Complete all tasks to satisfy gate `harness-pbt-green` (due 2026-11-18).  
Tasks are ordered so each builds on the last. Complete them in order.

---

## Task 1 — Project scaffolding

Set up the TypeScript project so all later tasks compile.

- [x] Create `package.json` with:
  - `"type": "module"`, `"engines": { "node": ">=22" }`
  - dependencies (pinned exact versions): `mssql`, `pg`, `fast-check`
  - devDependencies (pinned): `typescript`, `vitest`, `@types/node`, `@types/pg`, `@types/mssql`
  - scripts: `"build": "tsc"`, `"verify": "node dist/cli/verify.js"`, `"test": "vitest run"`
- [x] Create `tsconfig.json`: `strict: true`, `module: NodeNext`, `moduleResolution: NodeNext`, `outDir: dist`, `rootDir: src`
- [x] Create `.gitignore` additions: `dist/`, `node_modules/`, `.env`, `*.bak`
- [x] Create `docker/.env.example` with placeholders: `MSSQL_SA_PASSWORD=`, `PG_PASSWORD=`
- [x] Run `npm install` and confirm `node_modules` is populated

---

## Task 2 — Docker compose

Wire up the two database containers.

- [x] Create `docker/compose.yml` per the design: `mssql` (`mcr.microsoft.com/mssql/server:2025-latest`) and `postgres` (`postgres:18`), both with health checks, passwords from env vars — image changed to `postgis/postgis:18-3.6` by ruling R14 (2026-11-09)
- [x] Create `docker/pg-init/` directory (init scripts applied by the postgres container on first start)
- [x] Verify `docker compose -f docker/compose.yml config` exits 0 (validates the compose file syntax)

---

## Task 3 — Sources manifest

Record the WideWorldImporters release asset in `sources/manifest.json`.

- [x] Create `sources/manifest.json`:
  ```json
  {
    "entries": [
      {
        "repo": "https://github.com/microsoft/sql-server-samples",
        "release": "wide-world-importers-v1.0",
        "assetName": "WideWorldImporters-Full.bak",
        "assetUrl": "https://github.com/microsoft/sql-server-samples/releases/download/wide-world-importers-v1.0/WideWorldImporters-Full.bak",
        "sha256": "e842bad6ce02f74f166947e559dab1b476edd7eaae3da2ab9e3f522f1dd87124",
        "license": "MIT",
        "licenseUrl": "https://github.com/microsoft/sql-server-samples/blob/master/license.txt",
        "licenseConfirmedDate": "2026-11-04",
        "paths": ["WideWorldImporters-Full.bak"]
      }
    ]
  }
  ```

---

## Task 4 — Shared types and pair-record schema

Define the single source of truth for data shapes.

- [x] Create `src/harness/types.ts`: `RowSet`, `ColumnMeta`, `CompareResult`, `FindingKind` as documented in the design
- [x] Create `src/pairs/schema.ts`: `PairRecord`, `StepStatus` as documented in the design; export both types
- [x] Confirm `tsc --noEmit` passes with no errors after these files exist

---

## Task 5 — Database clients

Implement the two independent database clients.

- [x] Create `src/harness/clients/mssql-client.ts`:
  - Connects to `localhost:1433` (or the port from env) using the `mssql` package
  - Exposes `query(sql, params): Promise<RowSet>` and `loadRows(table, rows): Promise<void>`
  - `loadRows` uses parameterised INSERT statements (no string interpolation of row values)
  - Implements `close(): Promise<void>`
- [x] Create `src/harness/clients/pg-client.ts`:
  - Connects using the `pg` package
  - Same interface as `mssql-client.ts`
  - `loadRows` uses parameterised `$1, $2, …` placeholders
- [x] No shared query path between the two clients — each uses only its own driver

---

## Task 6 — PostgreSQL DDL

Create the target schema and table.

- [x] Create `docker/pg-init/01-schema.sql`:
  - Creates the `warehouse` schema
  - Creates `warehouse.stock_item_transactions` with all columns, matching the SQL Server schema
  - Column-type mappings (to be verified against the actual table definition):
    - `StockItemTransactionID int NOT NULL` → `integer NOT NULL`
    - `StockItemID int NOT NULL` → `integer NOT NULL`
    - `TransactionTypeID int NOT NULL` → `integer NOT NULL`
    - `InvoiceID int NULL` → `integer`
    - `SupplierInvoiceNumber nvarchar(20) NULL` → `varchar(20)`
    - `CustomerID int NULL` → `integer`
    - `PurchaseOrderID int NULL` → `integer`
    - `Quantity decimal(18,3) NOT NULL` → `numeric(18,3) NOT NULL`
    - `LastEditedBy int NOT NULL` → `integer NOT NULL`
    - `LastEditedWhen datetime2(7) NOT NULL` → `timestamp NOT NULL`
  - Records the mapping as a comment block at the top of the file

---

## Task 7 — PL/pgSQL conversion

Write and commit the hand-written PL/pgSQL function.

- [x] Read the source T-SQL `Integration.GetMovementUpdates` from WideWorldImporters (use the MEASURED definition: 2 parameters `@LastCutoff datetime2(7)`, `@NewCutoff datetime2(7)`; SELECT from `Warehouse.StockItemTransactions` WHERE `LastEditedWhen > @LastCutoff AND LastEditedWhen <= @NewCutoff`; ORDER BY `StockItemTransactionID`; output columns include space-named aliases)
- [x] Create `docker/pg-init/02-function.sql`: the PL/pgSQL function `integration.get_movement_updates(last_cutoff timestamp, new_cutoff timestamp)` returning `SETOF record` (or a typed return), with double-quoted column aliases matching the T-SQL output exactly — superseded 2026-11-09 by 015e0a7 (single-object harness replaced by the spec-driven harness in `src/harness/generic/`; this file was created in c2bb74f and removed then)
- [x] Create `conversions/WideWorldImporters/Integration.GetMovementUpdates.sql` (same content, for the pair record reference)
- [x] Create `conversions/WideWorldImporters/Integration.GetMovementUpdates.naive.sql`: deliberately uses `Quantity::int` (rounds) instead of the correct truncating cast — this is the planted-defect version — superseded 2026-11-09 by 015e0a7 (single-object harness replaced by the spec-driven harness in `src/harness/generic/`; this file was created in c2bb74f and removed then)
- [x] Record in `conversions/WideWorldImporters/Integration.GetMovementUpdates.diff` the diff between `engineOutput` (the initial draft) and `final` (accepted version) — superseded 2026-11-09 by 015e0a7 (single-object harness replaced by the spec-driven harness in `src/harness/generic/`; this file was created in c2bb74f and removed then)
- [x] Note in the pair record (task 11): `WITH EXECUTE AS OWNER` has no direct PostgreSQL equivalent; handling recorded

---

## Task 8 — Restore script

Implement the sha256-checked restore.

- [x] Create `src/harness/restore.ts`:
  - Reads `sources/manifest.json` for the asset URL and expected sha256
  - Checks `%LOCALAPPDATA%\ParityProven\sample-dbs\WideWorldImporters-Full.bak` first (if on Windows); downloads if absent or sha256 mismatch
  - Throws a clear error if the downloaded file's sha256 does not match — never proceeds to restore
  - Copies the `.bak` into the running `mssql` container and runs RESTORE DATABASE via `sqlcmd`
  - Verifies the database is ONLINE before returning
- [x] Verify the restore logic compiles (`tsc --noEmit`)

---

## Task 9 — Generators

Implement the fast-check arbitraries for the property.

- [x] Create `src/harness/generators.ts`: — superseded 2026-11-09 by 015e0a7 (single-object harness replaced by the spec-driven harness in `src/harness/generic/`; this file was created in c2bb74f and removed then)
  - `datetime2Arb`: generates values with 100 ns tick precision; records when PostgreSQL truncates to microseconds
  - `quantityArb`: `fc.oneof` biased toward fractional values (`2.5`, `-2.5`, `0.999`) and towards `0`
  - `nullableIntArb`: `fc.option(fc.integer({ min: 1 }), { nil: null, freq: 3 })` (~25 % NULL)
  - `stockItemTransactionRowArb`: combines the above into a full row
  - `cutoffPairArb`: two `datetime2Arb` values where `lastCutoff < newCutoff`, biased near sub-microsecond boundaries
- [x] Unit tests in `src/harness/generators.test.ts` (Vitest): — superseded 2026-11-09 by 015e0a7 (single-object harness replaced by the spec-driven harness in `src/harness/generic/`; this file was created in c2bb74f and removed then)
  - At least one test that the fractional-quantity bias produces fractional values
  - At least one test that the cutoff pair always has `lastCutoff < newCutoff`

---

## Task 10 — Compare and property

Implement result-set comparison and the equivalence property.

- [x] Create `src/harness/compare.ts`: — superseded 2026-11-09 by 015e0a7 (single-object harness replaced by the spec-driven harness in `src/harness/generic/`; this file was created in c2bb74f and removed then)
  - `compareRowSets(a: RowSet, b: RowSet): CompareResult | null`
  - Compares column count, names (exact, case-sensitive), row count, values (with type-aware coercion), and order
  - Returns `null` when equivalent; returns a structured `CompareResult` describing the first difference when not
- [x] Create `src/harness/property.ts`: — superseded 2026-11-09 by 015e0a7 (single-object harness replaced by the spec-driven harness in `src/harness/generic/`; this file was created in c2bb74f and removed then)
  - The async `fc.property` that: generates rows + cutoffs, loads into both engines (independently), calls each engine, compares results
  - Each engine called through its own client only
  - Cleans up loaded rows between runs
  - Records the seed and any load-time findings
- [x] Create `src/harness/defect-check.ts`: — superseded 2026-11-09 by 015e0a7 (single-object harness replaced by the spec-driven harness in `src/harness/generic/`; this file was created in c2bb74f and removed then)
  - Loads fractional-quantity rows into both engines
  - Runs the naive conversion (`Integration.GetMovementUpdates.naive.sql`) on PostgreSQL
  - Runs the real T-SQL object on SQL Server
  - Asserts the result sets differ; if they don't, throws with message: "Defect check FAILED: naive conversion was not detected — harness cannot be trusted"
- [x] Unit tests in `src/harness/compare.test.ts` (Vitest): — superseded 2026-11-09 by 015e0a7 (single-object harness replaced by the spec-driven harness in `src/harness/generic/`; this file was created in c2bb74f and removed then)
  - Test: identical row sets return null
  - Test: row count difference returns non-null
  - Test: value difference (int truncate vs round) returns non-null
  - Test: column name with spaces matches correctly

---

## Task 11 — Pair record

Commit the initial pair record.

- [x] Create `pairs/WideWorldImporters/Integration.GetMovementUpdates.json` conforming to `src/pairs/schema.ts`:
  ```json
  {
    "origin": {
      "repo": "https://github.com/microsoft/sql-server-samples",
      "release": "wide-world-importers-v1.0",
      "license": "MIT",
      "assetUrl": "https://github.com/microsoft/sql-server-samples/releases/download/wide-world-importers-v1.0/WideWorldImporters-Full.bak",
      "sha256": "e842bad6ce02f74f166947e559dab1b476edd7eaae3da2ab9e3f522f1dd87124"
    },
    "conversionType": "tsql-to-plpgsql",
    "objectClass": "procedure",
    "tier": "simple",
    "code": {
      "source": "<T-SQL source>",
      "engineOutput": "<initial hand-written draft>",
      "final": "<accepted PL/pgSQL>",
      "diff": "<diff>",
      "engine": "hand-written",
      "notes": [
        "WITH EXECUTE AS OWNER has no direct PostgreSQL equivalent; omitted in the conversion",
        "Output columns with spaces (e.g. 'WWI Invoice ID') are double-quoted in PL/pgSQL"
      ]
    },
    "columnMappings": [
      { "sqlServerType": "datetime2(7)", "postgresType": "timestamp", "notes": "100 ns ticks truncated to microseconds on load; recorded as load-time finding if observed" },
      { "sqlServerType": "decimal(18,3)", "postgresType": "numeric(18,3)" },
      { "sqlServerType": "int NULL", "postgresType": "integer" }
    ],
    "evidence": {
      "step1": "not-run",
      "step2": "not-run",
      "step3": "pending",
      "step4": "not-run",
      "step5": "not-run",
      "step6": "not-run",
      "harnessVersion": "harness-mvp-0.1.0"
    },
    "effort": {
      "humanMinutes": 0,
      "engineName": "hand-written",
      "engineVersion": "n/a"
    },
    "status": "pending"
  }
  ```
  Update `evidence.step3` to `"pass"` and populate `evidence.pbtSeeds` after the property runs green.

---

## Task 12 — CLI entry point

Wire everything into the `verify` command.

- [x] Create `src/cli/verify.ts`: — superseded 2026-11-09 by 015e0a7 (single-object harness replaced by the spec-driven harness in `src/harness/generic/`; this file was created in c2bb74f and removed then)
  - Parses `--seed <n>` flag (optional)
  - Checks that both Docker containers are healthy before proceeding (fails fast with a clear message if not)
  - Runs `restore.ts` to ensure WideWorldImporters is available
  - Runs the defect check; exits non-zero if the defect check fails to detect the known defect
  - Runs the property with the given seed (or a freshly generated one)
  - Writes seed and pass/fail summary to stdout
  - On failure: prints the counterexample and exits non-zero
  - On pass: prints "harness-pbt-green: PASS (seed: N)" and exits 0
- [x] Add `"verify": "node dist/cli/verify.js"` to `package.json` scripts — superseded 2026-11-09 by 015e0a7 (single-object harness replaced by the spec-driven harness in `src/harness/generic/`; this file was created in c2bb74f and removed then)
- [x] Verify `tsc` produces `dist/cli/verify.js` without errors — superseded 2026-11-09 by 015e0a7 (single-object harness replaced by the spec-driven harness in `src/harness/generic/`; this file was created in c2bb74f and removed then)

---

## Task 13 — README and final checks

Document the run sequence and do a clean-checkout dry run.

- [x] Create (or update) `README.md` with:
  - Prerequisites: Docker Desktop running, Node.js 22, `.env` created from `.env.example`
  - Run sequence:
    1. `docker compose -f docker/compose.yml up --detach`
    2. `npm install`
    3. `npm run build`
    4. `npm run verify`
  - `--seed` flag usage
  - Link to `sources/manifest.json` and the pair record
- [x] Run `npm run verify` end-to-end with Docker Desktop running; confirm output includes "harness-pbt-green: PASS" — done 2026-11-07 (6c2a248) and from a fresh clone 2026-11-08; the gate is recorded GREEN in the planning repo
- [x] Update `pairs/WideWorldImporters/Integration.GetMovementUpdates.json`: set `evidence.step3 = "pass"`, populate `evidence.pbtSeeds` with the seed from the passing run
- [x] Commit all files; confirm `/.kiro` is present and not in `.gitignore`

---

## Completion criterion

Gate `harness-pbt-green` is green when:
1. `npm run verify` exits 0 from a clean checkout (Docker Desktop running, `.env` present)
2. The defect check was seen failing before the correct conversion was accepted
3. `pairs/WideWorldImporters/Integration.GetMovementUpdates.json` has `evidence.step3 = "pass"` and a `pbtSeeds` entry
4. All files are committed and pushed to `origin/main`
