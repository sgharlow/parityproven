# predictions tasks

> Status checked against the code and git history on 2026-11-12 (decision M5A): every task below is done or superseded; superseded tasks say what replaced them.

Implements `design.md`. Complete in order.

---

## Task 1 — Schema

- [x] Create `src/predictions/schema.ts` with `CellEstimate`, `ExpectedFailure`, `PredictionFile` as in the design
- [x] Confirm `tsc --noEmit` passes

---

## Task 2 — Validate logic

- [x] Create `src/predictions/validate.ts`:
  - `validatePredictions(predFile, report): ValidationResult`
  - Checks: missing cells, extra cells, unknown expected-failure objects, p50 > 0, p90 >= p50
  - Returns `{ valid: boolean; errors: string[]; warnings: string[] }`
- [x] Unit tests in `src/predictions/validate.test.ts`:
  - Valid file passes
  - Missing cell → error
  - p50 = 0 → error
  - p90 < p50 → error
  - Unknown expected-failure object → error
  - Extra cell → warning (not error)

---

## Task 3 — Score logic

- [x] Create `src/predictions/score.ts`:
  - `scorePredictions(predFile, pairRecords): ScoreResult`
  - Groups pairs by objectClass × tier
  - Computes verified/pending/failed counts and actual average humanMinutes per cell
  - Returns a table structure for display
- [x] Unit test: empty pair records → all actuals = null, still returns valid result — src/predictions/score.test.ts (added 2026-11-12)

---

## Task 4 — CLI entry point

- [x] Create `src/cli/predictions.ts` with `validate` and `score` subcommands
- [x] Add to `package.json`:
  - `"predictions:validate": "node dist/cli/predictions.js validate"`
  - `"predictions:score": "node dist/cli/predictions.js score"`
- [x] `npm run build` produces `dist/cli/predictions.js`

---

## Task 5 — Prediction template files

- [x] Create `predictions/WideWorldImporters-v1.json` pre-populated from the live inventory
- [x] Create `predictions/AdventureWorks2025-v1.json` pre-populated from the live inventory
- [x] Both files have `committedAt: ""` and `basis: ""` as markers for Steve — done in c6b3016 (templates committed with empty markers)
- [x] `npm run predictions:validate -- --database WideWorldImporters` exits 1 with clear — done in c6b3016 (templates committed with empty markers)
  "p50Hours must be > 0" errors (confirms the gate works before Steve fills them in)

---

## Task 6 — Commit

After Steve fills in P50/P90 and expected failures:
- [x] Steve sets `committedAt` to the ISO timestamp of the commit — done by Steve in 23a4a8c (2026-11-08)
- [x] Steve writes one sentence in `basis` — done by Steve in 23a4a8c (2026-11-08)
- [x] `npm run predictions:validate -- --database WideWorldImporters` exits 0
- [x] `npm run predictions:validate -- --database AdventureWorks2025` exits 0
- [x] Commit with message: `predictions: WideWorldImporters and AdventureWorks2025 v1 (pre-conversion)` — 23a4a8c, 2026-11-07 20:31 MST; not amended since
- [x] This commit's timestamp is the proof of prediction — never amend it — 23a4a8c, 2026-11-07 20:31 MST; not amended since

---

## Completion criterion

Both validate commands exit 0 with Steve's numbers committed. The conversion loop (scope item 3) may not start before this commit exists.
