# conversion-loop design

```
src/conversions/specs.ts          ObjectSpec for each converted object
src/harness/generic/spec.ts       ObjectSpec/TableSpec types, DDL generation, type mappings
src/harness/generic/rows.ts       fast-check datasets; datetime/decimal/string/ref biases; µs normalisation
src/harness/generic/compare.ts    result comparison (order key groups, multisets, µs timestamps)
src/harness/generic/run.ts        scratch DB setup, load, run both engines, property, vacuity guard
src/pairs/diff.ts                 line diff for engineOutput -> final
src/cli/convert.ts                draft check -> final -> mutants -> pair record
conversions/<db>/<Schema.Object>.sql         final PL/pgSQL
conversions/<db>/<Schema.Object>.draft.sql   engine first draft (only when it differed from final)
```

## Flow per object
1. Read the T-SQL definition from `sys.sql_modules` of the restored sample database.
2. Drop/create the scratch database; create spec tables; deploy the definition unchanged.
3. Create PostgreSQL tables from the same spec.
4. Draft (if present): deploy, run property, record result.
5. Final: deploy (step 1), run fixed cases then the random property (step 3), apply vacuity guard.
6. Mutants: deploy each as `<fn>_mutant`, require failure.
7. Write the pair record.

## Decisions
- **Scratch database, not the sample database.** The sample database has foreign keys and real rows. Generated data would violate keys, and real rows would appear in only one engine.
- **Only referenced columns.** Keeps generation tractable. Recorded in the pair record notes.
- **Normalise datetimes to µs rather than hide the mismatch.** PostgreSQL cannot store 100 ns ticks. The count of affected values is reported.
- **Mutants over a single global planted defect.** Each object proves the harness can fail on that object's own logic (joins, rounding, casts, ordering, cutoffs).
- **Vacuity guard.** A pass with almost no rows compared is not evidence.

## Additions (2026-11-11)
```
src/conversions/specs-search.ts   Website.Search* (FOR JSON) specs, LIKE fixed cases, shared mutants
src/conversions/specs-logon.ts    Website.ActivateWebsiteLogon / ChangePassword (state form of step 3)
```
- **Scratch collation = source collation.** The scratch database is created `COLLATE <source database collation>` (WWI: `Latin1_General_100_CI_AS`; the server default is `SQL_Latin1_General_CP1_CI_AS`). Text comparison, `LIKE` and `ORDER BY` follow the source.
- **FOR JSON.** SQL Server streams a FOR JSON result as chunks of one `JSON_F52E2B61-…` column, and `INSERT … EXEC` is not allowed on it. The harness joins the chunks (`forJsonChunks`) and compares JSON columns as parsed values (`jsonColumns`: key order, array order, nulls and strings compared; whitespace not). An empty FOR JSON result is an empty string, compared as such.
- **Distinct sort keys (`ColSpec.distinct`).** Rows inside one JSON document cannot be compared as a multiset, and the source leaves tie order undefined, so sort-key columns are generated distinct. Tie order is not claimed.
- **State form of step 3 (`stateCheck`).** For objects that change data: the outcome (completed, or raised one of the declared errors: SQL Server error numbers / PostgreSQL SQLSTATEs) and every row of the listed tables, ordered by primary key, must match. Any other error fails the run. A sample counts toward coverage only when the call completed. Step 4 is not run for these objects (a data-changing call is not repeatable on the same data).
- **`prepare` hook.** Adjusts generated data before loading, identically for both engines, for preconditions random data almost never meets (a stored hash that matches a generated password). Fixed cases are not passed through it.
- **Generation controls.** `TableSpec.rows`, `ColSpec.strings` (vocabulary), `ColSpec.trueFraction` (bit), `ColSpec.role = "seq"` (unique, unconstrained), `varbinary` ↔ `bytea` (sent to SQL Server as hex, style 2).
- **PostgreSQL helpers (`tsql_compat` schema), created by each conversion file that needs them:** `like_to_regex` (T-SQL LIKE → anchored regex, used with `~*`), collation `latin1_general_100_ci_as` (ICU level 2 with ASCII punctuation order measured on SQL Server), `utf16le` (nvarchar bytes for `HASHBYTES`), and for OPENJSON: `isjson`, `json_member` / `json_path` (lax, first duplicate key wins), `openjson_with_rows`, `json_scalar`, `to_int`, `to_decimal_18_2`, `to_datetime2` (T-SQL string conversion rules measured on SQL Server 2025 at compatibility level 130).

## Additions (2026-11-11, decisions 1B / 2B / 3A)
```
src/conversions/dispositions.ts   not-converted (failed) and excluded objects, with reasons; npm run dispositions
src/conversions/observe.ts        SYSDATETIME() observations for state queries (each engine against its own clock)
src/conversions/specs-sequences.ts, specs-vehicle.ts, specs-coldroom.ts, specs-orders.ts, specs-invoices.ts
```
- **Dispositions.** `failed` objects get a pair record with steps 1-4 `not-run` and the reason (`engine: "not converted"`). `excluded` objects get no pair record; the receipts index lists them with their reason, class and tier (from the inventory), and the scorecard shows them under "Not converted: out of scope". The receipts build fails if an excluded object is missing from the inventory or also has a pair record.
- **Scratch compatibility level** = the source database's (WWI 130), alongside the collation.
- **State checks, extended.** `queries` (observation queries, compared as multisets), `errorClasses` (the outcome names the error class each engine raised, e.g. NOT NULL violation 515/23502), `informativeData` (what counts toward coverage), `sampleSetup` (per-sample statements, e.g. recreate sequences at generated values), `setup` (once, e.g. CREATE SEQUENCE). Tables without a key are compared as multisets.
- **Call-time values.** Columns written with SYSDATETIME() are observed as two columns: `<name>_now` ('now' / 'today' when the value is within the last 5 minutes on that engine's own clock) and `<name>` (the raw value otherwise). The exact time is not claimed; any other value is compared exactly.
- **Table-valued parameters (`TableSpec.tvp`).** SQL Server: `CREATE TYPE ... AS TABLE` in the scratch database; the call is preceded by T-SQL that fills a table variable one INSERT per row (so IDENTITY columns number rows 1..n, as for any T-SQL caller; the TDS driver cannot send a TVP whose type has an identity column). PostgreSQL: the same rows as a JSON array; the conversion provides `<type>_from_json` (CALL arguments cannot contain subqueries).
- **Memory-optimized objects.** `ObjectSpec.memoryOptimizedFilegroup` adds a MEMORY_OPTIMIZED_DATA filegroup to the scratch database; `TableSpec.memoryOptimized` creates memory-optimized tables (SCHEMA_ONLY) and table types, so natively compiled procedures deploy unchanged.
- **Dependencies.** `ObjectSpec.dependencies`: SQL Server deploys the dependency's original definition; PostgreSQL deploys its verified conversion file.
- **Generation controls.** `ColSpec.arbitrary` (purpose-built generator, e.g. structured JSON documents), `nullFraction`, `identity`.
- **Mutant text** is applied with function replacements, so `$` in a regular expression is not read as a replacement pattern.
- **Result-set error classes (`resultErrorClasses`, 2026-11-12).** For result-set objects that can legitimately fail (e.g. `OPTION (MAXRECURSION n)` on cyclic data), a declared error becomes a one-row outcome (`__raised`); both engines must raise the same class or return the same rows. Raised samples never count toward coverage.
- **Order check on typed values (2026-11-12).** Order keys are compared as typed values: dates/timestamps as microseconds, integer strings from the SQL Server driver as numbers. Text order keys are compared by code unit (collation order is not claimed by the order check).
- **`xml` column type (2026-11-12)**, compared as text; generated documents are in SQL Server's serialised form (an empty element is `<x/>`, measured).
- **Unit tests (2026-11-12)** cover compare/rows/spec and the vacuity and TVP functions in run; `scripts/mutate-check.ps1` proves each suite fails when a defect is planted in its source.
- **Equivalent mutants are not planted.** A mutant that cannot change any observable result under the object's preconditions (e.g. dropping an nvarchar(40) truncation in front of an nvarchar(20) column) is removed and the reason noted in the spec.
