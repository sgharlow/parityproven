# conversion-loop requirements

**Scope item:** 3 (conversion loop) and 4 (verification harness), generalised from `harness-mvp`.
**Goal:** convert T-SQL objects to PL/pgSQL with Kiro as the engine, prove each one with property-based equivalence tests, and record every result, including misses, as a pair record.

Supersedes the single-object harness built for `harness-mvp` (retired once this spec was verified against the same object).

## Requirements

### REQ-1 One spec per object drives both engines
1. `src/conversions/specs.ts` declares, per object: the tables it reads (only referenced columns), whether it takes the `@LastCutoff/@NewCutoff` window, the output columns its `ORDER BY` guarantees, and its planted-defect mutants.
2. The same table spec generates the SQL Server DDL, the PostgreSQL DDL, the generated data and the column-type mapping recorded in the pair record.

### REQ-2 Isolation
1. The original T-SQL definition is read from the restored sample database and deployed **unchanged** into a scratch database.
2. Scratch tables have no foreign keys and no pre-existing rows, so results depend only on generated data.
3. Each engine is queried only through its own client.

### REQ-3 Data generation (verification-standard traps)
1. Seeded fast-check generation; each sample is new data (no fixed-seed sampling inside the property).
2. datetime2 values cluster on and next to the cutoffs, including +/-1 tick and sub-microsecond ticks.
3. NULL in every nullable column; rounding-edge decimals; empty and trailing-space strings.
4. Reference columns draw from a shared key universe so multi-table joins return rows.
5. Datetime values and cutoffs are normalised to microseconds on both engines. The number of values that lost precision is recorded as a finding and the harness makes no claim about sub-microsecond inputs.

### REQ-4 Comparison
1. Row count, column names (exact, spaces preserved), and values (timestamps at microsecond resolution).
2. Order is compared only where the source guarantees it; rows sharing an order key compare as multisets; with no `ORDER BY` the whole result is a multiset.

### REQ-5 The harness must be seen failing
1. Every object declares mutants of its final conversion. Each must be reported as failing, or no pass is recorded.
2. A run where fewer than 30% of random samples return any rows fails as vacuous. A mutant that fails only because of vacuity does not count as detected.

### REQ-6 Engine first draft is evidence
1. If `conversions/<db>/<Object>.draft.sql` exists, the property runs against it first and the result (pass/fail, first finding, seed) is stored in `evidence.engineOutputCheck`.
2. `code.engineOutput` is the draft, `code.final` is the accepted conversion, `code.diff` is the computed difference.

### REQ-7 Pair record honesty
1. Step 1 (deploys on PostgreSQL) and step 3 (result sets match) are recorded from what ran. Steps 2, 4, 5, 6 stay `not-run`.
2. Status stays `pending`; `humanMinutes` is not invented.
3. Coverage (samples, samples with rows, rows compared), traps generated and mutants detected are stored.

## Out of scope
tSQLt/pgTAP (step 2), runtime factor (step 4), second review (step 5), objects that need temporal-table emulation, DECOMPRESS, or cursors.
