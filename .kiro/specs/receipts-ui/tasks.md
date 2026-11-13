# receipts-ui tasks

> Status checked against the code and git history on 2026-11-12 (decision M5A): every task below is done or superseded; superseded tasks say what replaced them.

Implements `design.md`. Complete in order.

---

## Task 1 — Receipt schema and builder

- [x] Create `src/receipts/schema.ts`: `ReceiptFile`, `ReceiptIndex` types as in the design
- [x] Create `src/receipts/builder.ts`:
  - `buildReceipts(pairsDir, inventoryDir, predictionsDir): Promise<{ receipts: ReceiptFile[], index: ReceiptIndex }>`
  - Reads all `pairs/<database>/*.json`
  - Matches each pair to its inventory item and prediction cell
  - Returns structured `ReceiptFile[]` and a `ReceiptIndex`
- [x] Unit test in `src/receipts/builder.test.ts`:
  - Builds correctly from one pair record + inventory + predictions
  - Missing predictions → `predictionCell: null` (not an error)
- [x] `tsc --noEmit` passes

---

## Task 2 — Receipt builder CLI

- [x] Create `src/cli/receipts.ts`:
  - Reads all pairs, inventory files, and predictions files
  - Calls `buildReceipts`
  - Writes `receipts/<database>/<schema>.<object>.json` for each receipt
  - Writes `receipts/index.json`
  - Prints: `Built N receipts (M verified, K pending, J failed)`
- [x] Add `"receipts:build": "node dist/cli/receipts.js"` to `package.json`
- [x] Run `npm run receipts:build` — produces at least one receipt from the existing pair record
- [x] `receipts/index.json` exists and is valid JSON

---

## Task 3 — Shared styles

- [x] Create `web/style.css`:
  - Clean, readable layout; system font stack; max-width ~900px centred
  - Status badge styles: verified (green), pending (amber), failed (red)
  - Step checklist styles
  - Code block styles (pre, monospace, scrollable)
  - Responsive: readable on mobile

---

## Task 4 — Scorecard page (`index.html`)

- [x] Create `web/index.html` with scorecard layout:
  - Fetches `../receipts/index.json` (relative path works when served from `web/`)
  - Renders summary stats and a table of all receipts with status badges and links
  - Shows "No conversions yet" message when index is empty
  - Works with JS disabled (shows a static "JavaScript required" message for the dynamic table)
- [x] Create `web/app.js` with the fetch-and-render logic

---

## Task 5 — Individual receipt page (`receipt.html`)

- [x] Create `web/receipt.html`:
  - Reads `?db=` and `?obj=` query params
  - Fetches `../receipts/<db>/<obj>.json`
  - Renders all receipt fields per the design
  - Source/final code tabs with highlight.js (SQL) loaded from CDN with integrity hash
  - Diff block (coloured unified diff)
  - Verification step checklist (steps 1–6 with labels and status badges)
  - "Not verified" banner
  - Re-run command block: `npm run verify -- --seed <seed>`
- [x] Verify the page renders correctly for `Integration.GetMovementUpdates`

---

## Task 6 — Questionnaire page (`questionnaire.html`)

- [x] Create `web/questionnaire.html` and `web/questionnaire.js`:
  - Number inputs for procedure/function/view/trigger counts
  - Sliders: % complex (0–100), % medium (0–100), % simple (auto-calculated)
  - On change: compute P50 and P90 totals using hardcoded tier rates
  - Display results in a `<output>` element
  - Disclaimer: "Judgment only — no samples from your database"
  - No network requests, no data storage, no form submission

---

## Task 7 — End-to-end check

- [x] `npm run receipts:build` exits 0, receipts/index.json has ≥ 1 entry
- [x] Open `web/index.html` in a browser (file:// or local server) — scorecard renders
- [x] Open `web/receipt.html?db=WideWorldImporters&obj=Integration.GetMovementUpdates` — receipt renders with correct data
- [x] Open `web/questionnaire.html` — estimate updates as inputs change
- [x] All 39 unit tests still pass: `npm test` — 120 unit tests pass on 2026-11-12

---

## Completion criterion

`npm run receipts:build` succeeds, all three pages render correctly in a browser, and the live URL (set up in the deployment task) serves the site.
