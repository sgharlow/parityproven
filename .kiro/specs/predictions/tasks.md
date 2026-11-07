# predictions tasks

Implements `design.md`. Complete in order.

---

## Task 1 — Schema

- [ ] Create `src/predictions/schema.ts` with `CellEstimate`, `ExpectedFailure`, `PredictionFile` as in the design
- [ ] Confirm `tsc --noEmit` passes

---

## Task 2 — Validate logic

- [ ] Create `src/predictions/validate.ts`:
  - `validatePredictions(predFile, report): ValidationResult`
  - Checks: missing cells, extra cells, unknown expected-failure objects, p50 > 0, p90 >= p50
  - Returns `{ valid: boolean; errors: string[]; warnings: string[] }`
- [ ] Unit tests in `src/predictions/validate.test.ts`:
  - Valid file passes
  - Missing cell → error
  - p50 = 0 → error
  - p90 < p50 → error
  - Unknown expected-failure object → error
  - Extra cell → warning (not error)

---

## Task 3 — Score logic

- [ ] Create `src/predictions/score.ts`:
  - `scorePredictions(predFile, pairRecords): ScoreResult`
  - Groups pairs by objectClass × tier
  - Computes verified/pending/failed counts and actual average humanMinutes per cell
  - Returns a table structure for display
- [ ] Unit test: empty pair records → all actuals = null, still returns valid result

---

## Task 4 — CLI entry point

- [ ] Create `src/cli/predictions.ts` with `validate` and `score` subcommands
- [ ] Add to `package.json`:
  - `"predictions:validate": "node dist/cli/predictions.js validate"`
  - `"predictions:score": "node dist/cli/predictions.js score"`
- [ ] `npm run build` produces `dist/cli/predictions.js`

---

## Task 5 — Prediction template files

- [ ] Create `predictions/WideWorldImporters-v1.json` pre-populated from the live inventory
- [ ] Create `predictions/AdventureWorks2025-v1.json` pre-populated from the live inventory
- [ ] Both files have `committedAt: ""` and `basis: ""` as markers for Steve
- [ ] `npm run predictions:validate -- --database WideWorldImporters` exits 1 with clear
  "p50Hours must be > 0" errors (confirms the gate works before Steve fills them in)

---

## Task 6 — Commit

After Steve fills in P50/P90 and expected failures:
- [ ] Steve sets `committedAt` to the ISO timestamp of the commit
- [ ] Steve writes one sentence in `basis`
- [ ] `npm run predictions:validate -- --database WideWorldImporters` exits 0
- [ ] `npm run predictions:validate -- --database AdventureWorks2025` exits 0
- [ ] Commit with message: `predictions: WideWorldImporters and AdventureWorks2025 v1 (pre-conversion)`
- [ ] This commit's timestamp is the proof of prediction — never amend it

---

## Completion criterion

Both validate commands exit 0 with Steve's numbers committed. The conversion loop (scope item 3) may not start before this commit exists.
