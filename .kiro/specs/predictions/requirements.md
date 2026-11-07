# predictions requirements

**Scope item:** 2 — Pre-registered predictions (KIROWEEN-PLAN.md).  
**Goal:** commit P50/P90 hour estimates per class×tier cell and a list of objects expected to fail, **before any conversion engine runs**. The commit timestamp is the proof of prediction.

Sources: steering `claims-and-evidence.md` ("Predictions committed before any engine runs"),  
`pair-records.md` (tier definitions), `structure.md` (predictions/ is append-only).

---

## Requirements

### REQ-1 Prediction file format

**User story:** As the scorecard, I can read a machine-parseable predictions file and compare it to actual pair-record outcomes.

**Acceptance criteria:**
1. Predictions are stored as JSON in `predictions/<database>-v1.json`.
2. The schema is defined in `src/predictions/schema.ts` and validated on read.
3. A prediction file contains:
   - `database`: the database name
   - `version`: `"v1"`
   - `committedAt`: ISO timestamp (set at commit time, never edited after)
   - `basis`: a short free-text note explaining the estimating method (e.g. "judgment from WideWorldImporters complexity tiers and harness-mvp experience")
   - `cellEstimates`: one entry per `objectClass × tier` cell actually present in the inventory, with `p50Hours` and `p90Hours`
   - `expectedFailures`: array of `{ database, schema, object, reason }` — objects the estimator predicts will not reach `step3=pass`
4. Files in `predictions/` are **append-only**. A correction is a new file (`-v2.json`) that references the old one; the original timestamp stays provable.

---

### REQ-2 Prediction CLI — validate

**User story:** As a developer, I can validate a predictions file against the current inventory to confirm every cell that exists in the inventory has an estimate.

**Acceptance criteria:**
1. `npm run predictions:validate -- --database <name>` reads `predictions/<database>-v1.json` and `inventory/<database>.json` and reports:
   - Which cells in the inventory have no estimate (missing)
   - Which cells in the predictions file have no objects in the inventory (extra)
   - Whether all expected-failure objects exist in the inventory
2. Exits 0 if there are no missing cells and no unknown expected-failure objects. Exits 1 otherwise.
3. Extra cells (predictions for cells not in the inventory) print a warning but do not cause exit 1.

---

### REQ-3 Prediction CLI — scorecard stub

**User story:** As the receipts UI, I can see a scorecard comparing predicted vs actual outcomes once pair records exist.

**Acceptance criteria:**
1. `npm run predictions:score -- --database <name>` reads the predictions file and all pair records for that database, and prints a table:
   ```
   Cell               P50h  P90h  Actual avg  Objects  Verified  Pending  Failed
   procedure/simple   N     N     —           N        0         N        0
   ...
   Expected failures: N predicted, N confirmed, N not-yet-run
   ```
2. When no pair records exist yet (the normal state when predictions are first committed), all "Actual" columns show `—` and the command still exits 0.
3. This command is a stub for now — it reads and prints; the full receipts UI renders it in HTML later.

---

### REQ-4 Predictions are append-only

**User story:** As the audit trail, the original prediction file is never edited after it is committed.

**Acceptance criteria:**
1. A pre-commit hook (or CI check) in `predictions/` ensures no existing `*-v1.json` file is modified once committed. Corrections go in a new version file.
2. `structure.md` already documents this; no code change needed there.
3. The `predictions:validate` command checks that `committedAt` in the file matches the git commit timestamp for that file (informational warning only — not a hard error).

---

## Out of scope for this spec

- The actual P50/P90 numbers and expected-failure list — those are Steve's estimates, entered manually into the JSON files before any conversion run.
- The conversion loop (scope item 3).
- The receipts UI rendering (scope item 5).
