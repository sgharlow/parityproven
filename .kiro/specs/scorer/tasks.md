# scorer tasks

> Status checked against the code and git history on 2026-11-12 (decision M5A): every task below is done or superseded; superseded tasks say what replaced them.

Implements `design.md`. Complete in order.

---

## Task 1 — Shared types

- [x] Add `Tier` export to `src/pairs/schema.ts` if not already exported (it is defined there as part of `PairRecord` — extract it as a standalone export so `src/inventory/types.ts` can re-export it)
- [x] Create `src/inventory/types.ts`:
  - Re-export `ObjectClass` and `Tier` from `../pairs/schema.js`
  - Define and export `InventoryItem`, `TierCounts`, `InventoryReport` as in the design
- [x] Confirm `tsc --noEmit` passes

---

## Task 2 — Tier classifier

- [x] Create `src/inventory/tier.ts`:
  - Define `COMPLEX_PATTERNS` and `MEDIUM_PATTERNS` arrays as in the design
  - Export `classifyTier(definition: string): Tier`
  - Complex is checked first, then medium, then simple (first match wins)
  - All pattern matching is case-insensitive
- [x] Create `src/inventory/tier.test.ts` (Vitest) with at least one positive and one negative case per pattern group:
  - complex: dynamic SQL, cursor, cross-db ref, OPENQUERY, xp_ proc
  - medium: temp table, table variable, MERGE, TRY/CATCH, window function, OUTPUT
  - simple: a plain SELECT procedure with no special patterns
- [x] Run `npm test` — all tests pass

---

## Task 3 — Expected counts

- [x] Create `src/inventory/expected-counts.ts`:
  ```ts
  import type { ObjectClass } from "./types.js";
  export const EXPECTED_COUNTS: Record<string, Partial<Record<ObjectClass, number>>> = {
    WideWorldImporters: { procedure: 42, function: 2, view: 3, trigger: 0 },
    AdventureWorks2025: { procedure: 10, function: 11, view: 20, trigger: 10 },
  };
  ```

---

## Task 4 — Inventory query

- [x] Create `src/inventory/query.ts`:
  - Export `runInventoryQuery(client: MssqlClient, database: string): Promise<InventoryItem[]>`
  - Uses the SQL from the design (JOIN sys.objects + sys.sql_modules, is_ms_shipped=0, types P/FN/IF/TF/V/TR)
  - Maps type codes to `ObjectClass` using the table in REQ-3
  - Calls `classifyTier(definition)` for each object
  - Returns sorted by objectClass then schemaName then objectName
- [x] Confirm `tsc --noEmit` passes

---

## Task 5 — Report builder

- [x] Create `src/inventory/report.ts`:
  - Export `buildReport(items: InventoryItem[], database: string): InventoryReport`
  - Counts by objectClass × tier
  - Computes total
  - Sets `generatedAt` to `new Date().toISOString()`
- [x] Add a unit test in `src/inventory/report.test.ts` that builds a report from a known set of items and asserts the counts

---

## Task 6 — AdventureWorks2025 manifest entry and restore

- [x] Look up the AdventureWorks2025 release on GitHub (`microsoft/sql-server-samples` releases) to confirm the asset URL and sha256 (the plan has prefix `fa6a2a5d…`)
- [x] Add the AdventureWorks2025 entry to `sources/manifest.json` with confirmed sha256, release tag, MIT license
- [x] Add `restoreAdventureWorks(opts)` to `src/harness/restore.ts`:
  - Same sha256-check pattern as `ensureWwiRestored`
  - Run `RESTORE FILELISTONLY` first to discover the logical file names, then RESTORE with MOVE clauses
  - Verify ONLINE and compatibility level 170 after restore
- [x] Run `npm run build` — compiles without error

---

## Task 7 — CLI entry point

- [x] Create `src/cli/inventory.ts` following the design:
  - `--database <name>` (required), `--out <path>` (optional)
  - Loads `.env`, creates `MssqlClient`, runs query, builds report
  - Compares counts to `EXPECTED_COUNTS` and prints warning on mismatch
  - Writes JSON to output path
  - Prints summary table
  - Exits 0/non-zero
- [x] Add `"inventory": "node dist/cli/inventory.js"` to `package.json` scripts
- [x] Run `npm run build` — `dist/cli/inventory.js` produced without error

---

## Task 8 — End-to-end run and verification

- [x] With Docker running and WideWorldImporters online: `npm run inventory -- --database WideWorldImporters`
  - Confirm counts match expected: 42 procedures, 2 functions, 3 views, 0 triggers, total 47
  - Confirm `inventory/WideWorldImporters.json` written
- [x] Restore AdventureWorks2025: add a `restoreAdventureWorks` call to verify it works, then run `npm run inventory -- --database AdventureWorks2025`
  - Confirm counts match expected: 10 procedures, 11 functions, 20 views, 10 triggers, total 51
  - Confirm `inventory/AdventureWorks2025.json` written
- [x] If any count differs from the expected, update `src/inventory/expected-counts.ts` with the live count and note the discrepancy in a comment
- [x] Add `inventory/*.json` to `.gitignore` (they are derived files; committed only when used as scorecard input)
- [x] Commit all files

---

## Completion criterion

Both `npm run inventory -- --database WideWorldImporters` and `npm run inventory -- --database AdventureWorks2025` exit 0 with correct counts, and all unit tests pass.
