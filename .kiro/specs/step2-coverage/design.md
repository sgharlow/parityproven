# step2-coverage design

## Where the cases live
Fixed cases are `ObjectSpec.fixedCases` in the object's spec file (`src/conversions/specs-*.ts`), as for the seven pilot objects. The step 3 runner already runs fixed cases as regression cases, so a case added here also takes part in the next `convert` run of that object (step 3); pair records are not re-run just for that.

## Tranche A (no generator change)
The 20 pending objects whose only blocker (`unsupportedFeatures()`) is "no fixed cases", in batches, simplest first:
- **Batch 1, scalar functions without tables** (`specs-aw.ts`): `ufnGetAccountingStartDate`, `ufnGetAccountingEndDate` (the datetime literal and the 3.33 ms rounding), the three `CASE @Status` functions (`statusCases()`: every mapped value, 0, the first unmapped value above the last, 255, NULL), `ufnLeadingZeros` (padding, sign, 8 and 9 characters, int limits, NULL).
- **Batch 2 onwards:** `ufnGetContactInformation` and the AdventureWorks views (rows per table, written like `salesPersonCase()`: each row is there for a reason the label names), then the four WideWorldImporters `Integration.Get*Updates` procedures (cutoff boundaries, as `GetMovementUpdates`/`GetOrderUpdates`).

The four AdventureWorks scalar functions that fail step 4 come last and may be skipped: they stay failed whatever step 2 says.

## Negative control (`agreed-tests --negative-control`)
`corruptExpected()` copies the committed expected file in memory and corrupts case 1: the first non-NULL value is changed to another value of the same kind (text gains a suffix; numbers gain 1 in the integer part, keeping their scale; dates and timestamps move a year; bits flip; bytes change their first nibble), so it still loads into the same column type. State objects get the opposite outcome. With no non-NULL value, an extra all-NULL row is expected instead. The tSQLt and PostgreSQL scripts are generated from the corrupted copy and run; nothing is written to `tests/`, planted defects are not run, and step 2 is not recorded. The control is "seen failing" only if case 1 fails on both engines and every other case passes; the run writes `evidence/agreed-controls/<db>/<Object>.txt` and exits 1 otherwise.

Checked on two pilot objects before use (2026-11-18): `Sales.vSalesPerson` (value `n:1 -> n:2`) and `Website.ChangePassword` (outcome `completed -> raised`) both failed on both engines; no pair record changed.

## Schema-bound objects (batch 2)
`tSQLt.FakeTable` renames a table, and SQL Server refuses to rename a table that a `WITH SCHEMABINDING` object depends on ("cannot be renamed because the object participates in enforced dependencies"; seen 2026-11-18 on `Person.vStateProvinceCountryRegion` and `Production.vProductAndDescription`). `agreed-tests` detects `WITH SCHEMABINDING` in the source definition and passes `tsqltScript(..., { schemaBound: true })`: each test then empties the spec's tables with `DELETE` instead, inside tSQLt's test transaction, which tSQLt rolls back. A schema-bound object with state tests (which run outside that transaction) is refused rather than handled. Unit tests: `src/agreed/generate.test.ts`. Both views' negative controls were seen failing on this path.

## Finding: Person.vStateProvinceCountryRegion (batch 2, REQ-4.3)
Step 2 found a real difference that step 3 had passed. The view joins `CountryRegionCode` under the source collation `SQL_Latin1_General_CP1_CI_AS`: case-insensitive and blind to trailing spaces, so `'us'` joins `'US'` and `'CA '` joins `'CA'`. Kiro's draft used PostgreSQL `=`, which is neither; the generated data never produced codes that differ only in case or trailing spaces, so step 3 passed. The draft is kept as `conversions/AdventureWorks2025/Person.vStateProvinceCountryRegion.draft.sql` (the receipt shows it failing), the conversion now compares `rtrim(code)` under a nondeterministic case-insensitive ICU collation (`tsql_compat.ci_as_equal`), and the two failing cases stay as regression cases. Planted defects for each part of the fix (collation dropped from both sides, rtrim dropped, inner join made left) are caught by step 3 and by the agreed tests. A first version of the collation defect removed it from one side only, which is unobservable (an explicit collation on either side applies) and was replaced.

Other objects may share the pattern: any join or comparison on text under a CI collation. The step 3 generator does not yet produce keys that differ only in case or trailing spaces; that is noted here, not fixed in this tranche.

## Tranches B and C
Not designed yet: JSON results, declared result errors and geography/xml columns (B); setup statements, state observation queries, table-valued parameters, identity columns, dependencies and memory-optimized tables (C). Each new feature gets unit tests in `src/agreed/` and its own negative control before a pass is trusted.
