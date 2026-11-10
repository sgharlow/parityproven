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
