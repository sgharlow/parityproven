# harness-mvp requirements

**Gate:** `harness-pbt-green` — due 2026-11-18.  
**Goal:** prove one WideWorldImporters object, `Integration.GetMovementUpdates`, equivalent between SQL Server and PostgreSQL under verification step 3 (result sets match), run from a clean checkout with one command.

Sources: `wwi-inventory-2026-11-06.md`, `kiro-request-harness-mvp.md`, steering docs (`tech.md`, `verification-standard.md`, `sources-and-data.md`, `structure.md`, `pair-records.md`).

---

## Requirements

### REQ-1 Docker environment

**User story:** As a developer running from a clean checkout, I can bring up both databases with one command so the harness has live engines to run against.

**Acceptance criteria:**
1. `docker/compose.yml` defines a `mssql` service using `mcr.microsoft.com/mssql/server:2025-latest` and a `postgres` service using `postgres:18`.
2. All passwords are read from `.env` (gitignored); no password appears in the compose file or any committed file.
3. Both services have health checks. The harness waits for both to report healthy before running.
4. A `docker/.env.example` lists every required variable with placeholder values.

---

### REQ-2 WideWorldImporters restore

**User story:** As the harness, I restore WideWorldImporters from the pinned release asset so every run starts from a known, reproducible state.

**Acceptance criteria:**
1. `sources/manifest.json` records the `microsoft/sql-server-samples` repo, release `wide-world-importers-v1.0`, asset URL for `WideWorldImporters-Full.bak`, and sha256 `e842bad6ce02f74f166947e559dab1b476edd7eaae3da2ab9e3f522f1dd87124`.
2. The restore step downloads the `.bak` (or uses the local cache at `%LOCALAPPDATA%\ParityProven\sample-dbs\` if the sha256 matches) and restores it into the `mssql` container.
3. If the sha256 of the downloaded file does not match the manifest, the harness exits with a non-zero code and a clear error; it never restores a mismatched file.
4. The license (`license.txt` = MIT from `microsoft/sql-server-samples`) is recorded in the manifest entry and re-confirmed at intake.

---

### REQ-3 PostgreSQL DDL for `Warehouse.StockItemTransactions`

**User story:** As the harness, I create the target table in PostgreSQL with every column-type mapping recorded so the pair record is self-documenting.

**Acceptance criteria:**
1. DDL creates `warehouse.stock_item_transactions` (or equivalent quoted schema) in PostgreSQL.
2. Every column mapping is recorded in the pair record: `datetime2(7)` → `timestamp`, `decimal(18,3)` → `numeric(18,3)`, `int` nullable → `integer`, etc.
3. The DDL is committed in `docker/pg-init/` (or equivalent) and applied by an init script, not by hand.
4. A load-time difference (a value that changes when inserted into PostgreSQL vs SQL Server due to type coercion) is reported as a finding in the pair record, never silently accepted.

---

### REQ-4 PL/pgSQL conversion of `Integration.GetMovementUpdates`

**User story:** As the engineer, I have a hand-written PL/pgSQL function that is the target for verification step 3.

**Acceptance criteria:**
1. A PL/pgSQL function (or procedure returning a result set) equivalent to `Integration.GetMovementUpdates` is committed under `src/harness/` or a dedicated `conversions/` path.
2. The pair record field `code.engine` is `"hand-written"` and `code.engineOutput` is the initial draft; `code.final` is the accepted version; `code.diff` is the diff between them.
3. `WITH EXECUTE AS OWNER` (present in the source) has no direct PostgreSQL equivalent; this is noted in the pair record's evidence.
4. The function returns rows with the same column names as the T-SQL output, quoted as needed for PostgreSQL (the output has columns with spaces, e.g. `WWI Invoice ID`).

---

### REQ-5 Property-based equivalence test

**User story:** As the harness, I run a fast-check property that proves `Integration.GetMovementUpdates` returns equivalent result sets on both engines for any generated input.

**Acceptance criteria:**
1. The property generates rows for `Warehouse.StockItemTransactions` and two cutoff parameters (`@LastCutoff`, `@NewCutoff` of type `datetime2(7)`).
2. The same generated rows are loaded into both the SQL Server and PostgreSQL databases; each engine is accessed through its own client (`mssql` and `pg` respectively). There is no symmetric shortcut where the same path runs on both.
3. The comparison covers: row count, column names, column types, values, and row order (ORDER BY `StockItemTransactionID`).
4. Generators are biased toward known traps:
   - `Quantity` values with fractional parts (e.g. `2.5`, `-2.5`, `0.999`) — `CAST(Quantity AS int)` truncates in T-SQL, rounds in PostgreSQL `::int`
   - `NULL` in the four nullable ID columns (`InvoiceID`, `PurchaseOrderID`, `CustomerID`, `SupplierID`)
   - `datetime2` cutoff values with sub-microsecond ticks (100 ns precision) on and around both cutoffs
5. Any value that changes when loaded into PostgreSQL (load-time difference) is reported as a finding, separately from object-level mismatches.
6. Every run records its seed. A seed can be passed on the CLI to reproduce a specific run.

---

### REQ-6 Planted-defect check

**User story:** As the harness, I confirm that the test suite can detect a real defect before I trust it as evidence.

**Acceptance criteria:**
1. A deliberately naive PL/pgSQL conversion uses `Quantity::int` (which rounds rather than truncates) in place of the correct truncating cast.
2. When run against data that includes fractional `Quantity` values, the property reports this conversion as FAILING.
3. The defect check runs as part of the test suite and its failure is reported clearly (not swallowed or skipped).
4. The correct conversion is accepted by the property only after the defect check passes (i.e., the harness has been seen failing before it is trusted).

---

### REQ-7 CLI and reproducibility

**User story:** As a reviewer, I can reproduce any run from the public repo with one command after `docker compose up`.

**Acceptance criteria:**
1. A single CLI command (e.g. `npm run verify`) runs the full property-based test suite after the containers are healthy.
2. The command accepts a `--seed <n>` flag to replay a specific run.
3. The README documents the full sequence: prerequisites, `docker compose up --detach`, restore command, verify command.
4. Every run writes its seed and a pass/fail summary to stdout.

---

### REQ-8 Pair record

**User story:** As the verification record, the pair file captures the state of the object at the time it was verified.

**Acceptance criteria:**
1. `pairs/WideWorldImporters/Integration.GetMovementUpdates.json` is committed with:
   - `evidence.step3` = `"pass"` (after the property passes)
   - `evidence.step1`, `step2`, `step4`, `step5`, `step6` = `"not-run"` (out of scope for this spec)
   - `status` = `"pending"` (not `"verified"` — full verification requires all 6 steps)
   - `effort.engine` = `"hand-written"`
2. The record conforms to the schema defined in `src/pairs/schema.ts`.
3. The pair record includes the column-type mappings from REQ-3 and the `WITH EXECUTE AS OWNER` note from REQ-4.
4. The PBT seed from the passing run is recorded in `evidence.pbtSeeds`.

---

## Out of scope for this spec

- The complexity scorer, predictions, Babelfish Compass runs, tSQLt/pgTAP, runtime factor measurement, receipts UI, questionnaire, MCP server.
- AdventureWorks (deferred until after `harness-pbt-green` is green).
- Any object other than `Integration.GetMovementUpdates` and the planted-defect variant.
