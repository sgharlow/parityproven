# predictions design

Implements `requirements.md`.

---

## Repository additions

```
src/
  predictions/
    schema.ts          # PredictionFile, CellEstimate, ExpectedFailure types
    validate.ts        # validatePredictions(db): ValidationResult
    score.ts           # scorePredictions(db): ScoreResult

  cli/
    predictions.ts     # entry point: validate | score subcommands

predictions/
  WideWorldImporters-v1.json    # Steve fills in P50/P90 and expected failures
  AdventureWorks2025-v1.json    # Steve fills in P50/P90 and expected failures
```

---

## Schema (`src/predictions/schema.ts`)

```ts
export interface CellEstimate {
  objectClass: ObjectClass;
  tier: Tier;
  count: number;          // from inventory at time of prediction
  p50Hours: number;       // median effort per object (human judgment)
  p90Hours: number;       // 90th-percentile effort per object
  note?: string;          // optional free-text reasoning
}

export interface ExpectedFailure {
  schema: string;
  object: string;
  reason: string;         // why this object is predicted to not reach step3=pass
}

export interface PredictionFile {
  database: string;
  version: "v1";
  committedAt: string;    // ISO timestamp — set once, never edited
  basis: string;          // estimating method note
  cellEstimates: CellEstimate[];
  expectedFailures: ExpectedFailure[];
}
```

Validation rules:
- `p50Hours` and `p90Hours` must both be > 0
- `p90Hours >= p50Hours`
- Every cell in the inventory has a corresponding `cellEstimate` entry
- Every `expectedFailure` object exists in the inventory

---

## CLI (`src/cli/predictions.ts`)

Subcommands dispatched from `process.argv[2]`:

**`validate`** — `npm run predictions:validate -- --database <name>`
1. Load `predictions/<database>-v1.json` and `inventory/<database>.json`
2. Check for missing cells, extra cells, unknown expected-failure objects
3. Check `p50 > 0`, `p90 >= p50` for all cells
4. Print results; exit 0 if valid, 1 if errors

**`score`** — `npm run predictions:score -- --database <name>`
1. Load predictions file and all `pairs/<database>/*.json`
2. For each cell: count verified/pending/failed, compute actual average humanMinutes
3. Print comparison table; exit 0 always

---

## Prediction files — pre-populated structure

Both files are generated from the live inventory with:
- `count` filled from inventory
- `p50Hours` and `p90Hours` set to `null` (markers for Steve to fill in)
- `expectedFailures` pre-populated with the objects most likely to fail
  based on the inventory analysis (all 8 complex WWI cursors; triggers for AW2025)
- `committedAt` left as `""` — Steve sets it to the actual commit time before committing
- `basis` left as `""` — Steve writes one sentence

The files are valid JSON but will fail `predictions:validate` until Steve fills them in —
that's the designed behaviour: validate gates the conversion loop start.
