# scorer design

Implements `requirements.md`. Follows steering: `tech.md`, `structure.md`, `pair-records.md`, `sources-and-data.md`.

---

## Repository additions

```
src/
  inventory/
    types.ts            # InventoryItem, InventoryReport, ObjectClass, Tier (REQ-1, REQ-3)
    tier.ts             # classifyTier(definition) — single implementation (REQ-2)
    tier.test.ts        # unit tests for tier rules (REQ-2)
    query.ts            # runInventoryQuery(client, database): InventoryItem[] (REQ-1)
    report.ts           # buildReport(items, database): InventoryReport (REQ-4)
    expected-counts.ts  # EXPECTED_COUNTS per database (REQ-5)

  cli/
    inventory.ts        # entry point: --database, --out flags (REQ-4)

  harness/
    restore.ts          # extended with restoreAdventureWorks() (REQ-6)

sources/
  manifest.json         # gains AdventureWorks2025 entry (REQ-6)

inventory/              # output directory (gitignored raw; the report files are committed on use)
```

`src/pairs/schema.ts` already exports `ObjectClass` and `Tier` — `src/inventory/types.ts` re-exports them rather than redefining. The pair record's tier field and the scorer's tier output must use the exact same type.

---

## Types (`src/inventory/types.ts`)

```ts
export type { ObjectClass, Tier } from "../pairs/schema.js";

export interface InventoryItem {
  schemaName: string;
  objectName: string;
  objectClass: ObjectClass;
  tier: Tier;
  definition: string;
}

export interface TierCounts {
  simple: number;
  medium: number;
  complex: number;
  total: number;
}

export interface InventoryReport {
  database: string;
  generatedAt: string;
  counts: {
    procedure: TierCounts;
    function:  TierCounts;
    view:      TierCounts;
    trigger:   TierCounts;
    total:     number;
  };
  objects: InventoryItem[];
}
```

---

## Tier classifier (`src/inventory/tier.ts`)

Classification order: complex → medium → simple (first match wins).

```ts
const COMPLEX_PATTERNS = [
  /\bEXEC\s*\(/i,           // EXEC(@sql) or EXEC (
  /\bsp_executesql\b/i,
  /\bCURSOR\b/i,
  /\b(EXTERNAL|UNSAFE)\s+ASSEMBLY\b/i,   // CLR
  /\w+\.\.\w+/,             // cross-database reference: db..object
  /\bOPENQUERY\b/i,
  /\bOPENROWSET\b/i,
  /\bxp_/i,
  /\bLINKED\s+SERVER\b/i,
];

const MEDIUM_PATTERNS = [
  /\b#[\w]+\b/,             // temp table
  /\bDECLARE\s+@\w+\s+TABLE\b/i,  // table variable
  /\bMERGE\b/i,
  /\bTRY\b[\s\S]*?\bCATCH\b/i,    // TRY/CATCH
  /\bOVER\s*\(/i,           // window function
  /\bOUTPUT\b/i,
];
```

`classifyTier(definition)` — scan patterns in order, return the first tier that matches, default `'simple'`.

---

## Inventory query (`src/inventory/query.ts`)

```sql
SELECT
  SCHEMA_NAME(o.schema_id)  AS schema_name,
  o.name                    AS object_name,
  o.type                    AS type_code,
  m.definition              AS definition
FROM sys.objects o
JOIN sys.sql_modules m ON m.object_id = o.object_id
WHERE o.is_ms_shipped = 0
  AND o.type IN ('P', 'FN', 'IF', 'TF', 'V', 'TR')
ORDER BY o.type, SCHEMA_NAME(o.schema_id), o.name;
```

Maps `type_code` → `ObjectClass`, calls `classifyTier(definition)`, returns `InventoryItem[]`.

Note: `sys.sql_modules` does not have a row for objects with no text definition (e.g. system-generated). The JOIN ensures only objects with a definition are included. Views without `SCHEMABINDING` and triggers still appear.

---

## Expected counts (`src/inventory/expected-counts.ts`)

```ts
export const EXPECTED_COUNTS: Record<string, Record<ObjectClass, number>> = {
  WideWorldImporters: {
    procedure: 42, function: 2, view: 3, trigger: 0,
  },
  AdventureWorks2025: {
    procedure: 10, function: 11, view: 20, trigger: 10,
  },
};
```

---

## CLI (`src/cli/inventory.ts`)

Sequence:
1. Parse `--database`, `--out` from `process.argv`.
2. Load `.env`.
3. Create `MssqlClient` for the named database.
4. Run `runInventoryQuery`.
5. Build report with `buildReport`.
6. Compare totals to `EXPECTED_COUNTS[database]`; print warning if they differ.
7. Write JSON to `--out` path (default `inventory/<database>.json`).
8. Print summary table to stdout.
9. Exit 0.

Add `"inventory": "node dist/cli/inventory.js"` to `package.json` scripts.

---

## AdventureWorks2025 restore (`src/harness/restore.ts`)

Add `restoreAdventureWorks(opts)` following the same sha256-check pattern as `ensureWwiRestored`. The RESTORE needs MOVE clauses for the AdventureWorks2025 file groups (discover with `RESTORE FILELISTONLY` at install time and hardcode the paths).

The manifest entry for AdventureWorks2025 will include the full sha256 confirmed at intake (KIROWEEN-PLAN lists prefix `fa6a2a5d…`).

---

## Key design decisions

1. **Single tier implementation.** `src/inventory/tier.ts` is the only place tier logic lives. `src/pairs/schema.ts` imports the type; the CLI imports the function. If the rules change, one file changes.
2. **No database schema modification.** The inventory query is read-only. No tSQLt, no test schema, no temp tables on SQL Server.
3. **Live counts are authoritative.** The expected-counts check is a warning, not a gate. The denominator in the scorecard always comes from the live inventory run, not from hardcoded numbers.
4. **Report file is the source of truth.** All later steps (predictions, receipts scorecard) read `inventory/<database>.json` rather than re-querying the database.
