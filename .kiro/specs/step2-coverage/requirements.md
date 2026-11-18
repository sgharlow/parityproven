# step2-coverage requirements
**Scope item:** 4 (verification harness), step 2 of `verification-standard.md` for the objects still pending.
**Goal:** every pending object that passes steps 1, 3 and 4 gets agreed tests (step 2), so the owner's step 5 review is the only thing left between it and "verified".
**Ruling:** R23 (2026-11-17) lifts the feature freeze for this work. Dates (owner, T1, 2026-11-18): tranche A first passes by 2026-11-22, tranche B by 2026-11-25, tranche C only if A and B are done by 2026-11-26.
Builds on `conversion-loop` (step 2 pilot, `src/agreed/generate.ts`, `npm run agreed-tests`).

## Requirements
### REQ-1 Fixed cases are hand-derived and say what they pin down
1. Each fixed case is written from the source T-SQL, not from the conversion, and its label names the behaviour it tests (a mapping, a boundary, a NULL, a rounding or precision trap from `verification-standard.md`). A label that does not say what it tests cannot be reviewed at step 5.
2. Expected results are captured once from the original T-SQL on SQL Server (`agreed-tests`) and committed in `tests/<db>/<Object>.expected.json`, next to the generated `.tsqlt.sql` and `.pg.sql`.

### REQ-2 Each side runs on its own engine
1. tSQLt on SQL Server, plain-SQL assertions on PostgreSQL. Expected values come from the original T-SQL, never from the conversion.

### REQ-3 Negative controls before trusting a pass
1. For every object given step 2, a corrupted expected result (a value for result-set objects, the outcome for state objects) must fail on both engines while every other case passes. The output is kept in `evidence/agreed-controls/<db>/<Object>.txt`.
2. The control never writes `tests/` or the pair record.
3. For every generator feature added in tranches B and C, one such failure is shown before a pass using that feature is trusted.

### REQ-4 Recording
1. A step 2 pass changes `evidence.step2` and `evidence.testsRun` only. Step 5 is the owner's review; nothing here records it, and no record says "verified" until he has logged it.
2. `agreed-tests` keeps reporting how many planted defects the agreed tests catch; step 3 remains the gate for planted defects.
3. If step 2 exposes a real difference in a conversion that passed step 3, it is a finding: recorded, the conversion fixed in the open, the failing case kept as a regression case. The case is never weakened.

### REQ-5 Review
1. `npm run review-packet -- --object <obj>` produces a packet in `.tmp/reviews/` for each object given step 2.
2. Numbers on the site and in the README come from `pairs/` and `receipts/` (`npm run receipts:build`, which also regenerates the README status block).
