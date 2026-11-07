# harness-mvp design

Implements `requirements.md`. Follows steering: `tech.md`, `verification-standard.md`, `sources-and-data.md`, `structure.md`, `pair-records.md`.

---

## Repository layout (this spec only)

```
docker/
  compose.yml                   # mssql + postgres services with health checks
  .env.example                  # placeholder values for all required vars
  mssql-init/
    restore.sh                  # waits for SA login, then calls the restore CLI command
  pg-init/
    01-schema.sql               # warehouse schema + stock_item_transactions DDL
    02-function.sql             # Integration.get_movement_updates PL/pgSQL function

src/
  harness/
    clients/
      mssql-client.ts           # connects via `mssql`; query helper returns RowSet
      pg-client.ts              # connects via `pg`; query helper returns RowSet
    types.ts                    # RowSet, ColumnMeta, FindingKind (shared)
    compare.ts                  # compareRowSets(a, b): Diff | null
    generators.ts               # fast-check arbitraries for StockItemTransaction rows + cutoffs
    property.ts                 # the fc.property that wires generators -> load -> run -> compare
    defect-check.ts             # runs the naive conversion and asserts it FAILS
    restore.ts                  # downloads/checks sha256, calls sqlcmd RESTORE
    seed.ts                     # seed recording and --seed CLI flag

  pairs/
    schema.ts                   # PairRecord type (single definition; all other files import it)

  cli/
    verify.ts                   # entry point: parse args, compose up guard, restore, run property

sources/
  manifest.json                 # REQ-2: WWI release asset + sha256 + MIT license

pairs/
  WideWorldImporters/
    Integration.GetMovementUpdates.json   # REQ-8: pair record, status = "pending"

conversions/
  WideWorldImporters/
    Integration.GetMovementUpdates.sql         # hand-written PL/pgSQL (final)
    Integration.GetMovementUpdates.naive.sql   # planted-defect version (Quantity::int)
    Integration.GetMovementUpdates.diff        # diff from engineOutput to final

README.md                       # prerequisites + run sequence (REQ-7)
package.json                    # scripts: verify, verify:seed, compose:up
tsconfig.json
.env.example  (root)            # symlink or copy of docker/.env.example
```

---

## Components

### Docker compose (REQ-1)

```
services:
  mssql:
    image: mcr.microsoft.com/mssql/server:2025-latest
    environment:
      ACCEPT_EULA: "Y"
      MSSQL_SA_PASSWORD: "${MSSQL_SA_PASSWORD}"
    healthcheck:
      test: ["/opt/mssql-tools18/bin/sqlcmd", "-S", "localhost", "-U", "sa", "-P", "${MSSQL_SA_PASSWORD}", "-No", "-Q", "SELECT 1"]
      interval: 10s
      retries: 10

  postgres:
    image: postgres:18
    environment:
      POSTGRES_PASSWORD: "${PG_PASSWORD}"
      POSTGRES_DB: parityproven
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 10
    volumes:
      - ./pg-init:/docker-entrypoint-initdb.d
```

### Clients (`mssql-client.ts`, `pg-client.ts`)

Each exposes:
```ts
interface DatabaseClient {
  query(sql: string, params: unknown[]): Promise<RowSet>;
  loadRows(table: string, rows: TableRow[]): Promise<void>;
  close(): Promise<void>;
}
```

`RowSet` carries column metadata (name, declared type) alongside rows. Clients are created once per property run and reused across samples within that run. **No shared path between clients**: each calls its own driver against its own container port.

### Generators (`generators.ts`)

Built with `fast-check` arbitraries:

| What | Arbitrary | Bias |
|---|---|---|
| `StockItemTransactionID` | `fc.integer({ min: 1 })` | — |
| `Quantity` | `fc.oneof(fc.float(), fc.constant(2.5), fc.constant(-2.5), fc.constant(0.999))` | fractional values weighted 3:1 |
| `LastEditedWhen` (datetime2 7) | custom `datetime2Arb` | boundary: sub-microsecond ticks; values near both cutoffs |
| nullable IDs | `fc.option(fc.integer({ min: 1 }), { nil: null, freq: 3 })` | NULL weighted ~25 % |
| cutoffs | two `datetime2Arb` values, `@LastCutoff < @NewCutoff` | same sub-microsecond bias |

`datetime2Arb`: generates a `bigint` representing 100 ns ticks since epoch, then formats as an ISO string with 7-decimal precision for SQL Server and truncates to microseconds for PostgreSQL (recording the truncation as a possible load-time finding).

### `compare.ts`

```ts
function compareRowSets(a: RowSet, b: RowSet): CompareResult {
  // 1. column count
  // 2. column names (exact, case-sensitive; spaces preserved)
  // 3. column types (declared; mismatch = warning, not failure)
  // 4. row count
  // 5. per-row, per-column value comparison (with type-aware coercion for known mappings)
  // 6. row order (by StockItemTransactionID)
}
```

Value coercion table (applied before comparison):
- `decimal(18,3)` SQL Server `CAST(...AS int)` → truncate-toward-zero, not round
- `datetime2(7)` → truncate to microseconds (any sub-microsecond difference is a finding, not a failure, unless the column value feeds the WHERE clause result)

### Property (`property.ts`)

```ts
fc.assert(
  fc.asyncProperty(
    rowsArb, lastCutoffArb, newCutoffArb,
    async (rows, lastCutoff, newCutoff) => {
      await Promise.all([
        mssql.loadRows('Warehouse.StockItemTransactions', rows),
        pg.loadRows('warehouse.stock_item_transactions', rows),
      ]);
      const [ssResult, pgResult] = await Promise.all([
        mssql.query(SS_CALL, [lastCutoff, newCutoff]),
        pg.query(PG_CALL, [lastCutoff, newCutoff]),
      ]);
      const diff = compareRowSets(ssResult, pgResult);
      if (diff) throw new Error(formatDiff(diff));
    }
  ),
  { seed: options.seed, numRuns: 100 }
);
```

The property cleans up loaded rows between runs (DELETE WHERE StockItemTransactionID IN (...)) to keep the tables stable.

### Defect check (`defect-check.ts`)

1. Loads rows with fractional `Quantity` values into both engines.
2. Runs the naive conversion (which uses `Quantity::int`, rounding instead of truncating) on PostgreSQL.
3. Runs the real T-SQL object on SQL Server.
4. Asserts that `compareRowSets` returns a non-null diff.
5. If the diff is null (no mismatch detected), the defect check throws: "Defect check FAILED: naive conversion was not detected — harness cannot be trusted."

### Restore (`restore.ts`)

1. Reads `sources/manifest.json` to get the asset URL and expected sha256.
2. Checks `%LOCALAPPDATA%\ParityProven\sample-dbs\WideWorldImporters-Full.bak` first; if present and sha256 matches, uses it. Otherwise downloads.
3. Copies the `.bak` into the running `mssql` container and runs `RESTORE DATABASE` via `sqlcmd`.
4. Verifies the restored database is ONLINE before returning.

### Pair record (`src/pairs/schema.ts`)

```ts
export interface PairRecord {
  origin: { repo: string; release: string; license: string; assetUrl: string; sha256: string } | 'synthetic';
  conversionType: 'tsql-to-plpgsql';
  objectClass: 'procedure' | 'function' | 'view' | 'trigger';
  tier: 'simple' | 'medium' | 'complex';
  code: {
    source: string;
    engineOutput: string;
    final: string;
    diff: string;
    engine: string;      // "hand-written" | "kiro:<model>:<version>"
    notes?: string[];    // e.g. "WITH EXECUTE AS OWNER has no PG equivalent"
  };
  columnMappings: Array<{ sqlServerType: string; postgresType: string; notes?: string }>;
  evidence: {
    step1: StepStatus; step2: StepStatus; step3: StepStatus;
    step4: StepStatus; step5: StepStatus; step6: StepStatus;
    testsRun?: string[]; rowsCompared?: number; trapsCovered?: string[];
    runtimeRatio?: number; pbtSeeds?: number[]; harnessVersion: string;
    reviewer?: string; reviewDate?: string;
  };
  effort: { humanMinutes: number; engineName: string; engineVersion: string };
  status: 'pending' | 'failed' | 'verified';
  loadTimeFindings?: string[];
}

type StepStatus = 'pass' | 'fail' | 'not-run' | 'n/a';
```

---

## Key design decisions

1. **No symmetric shortcut.** The SQL Server call goes through `mssql-client.ts` only; the PostgreSQL call goes through `pg-client.ts` only. They share no query path.
2. **Load-time differences are findings, not failures.** A sub-microsecond datetime2 value that PostgreSQL rounds on insert is recorded as a finding in the pair record. The comparison runs on what was actually stored (retrieved after insert), not on the original generated value.
3. **Seed-first.** The seed is chosen before the property runs and written to stdout immediately, so a failure can always be reproduced even if the process crashes mid-run.
4. **Defect check gates the run.** `verify.ts` runs the defect check before the real property. If the defect check passes (i.e., fails to detect the known defect), the CLI exits non-zero and the property does not run.
5. **Status stays `"pending"`.** The pair record is committed with `status: "pending"` because steps 1, 2, 4, 5, 6 are out of scope. The receipt for this spec will show "pending — step 3 pass, steps 1/2/4/5/6 not run."
6. **Column names with spaces.** The T-SQL output includes columns like `[WWI Invoice ID]`. The PL/pgSQL function returns them as `"WWI Invoice ID"` (double-quoted). The comparison normalises by exact string match, preserving spaces.
