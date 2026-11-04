---
inclusion: always
---

# Claims and evidence

Every word on a receipt, in the UI or in a report must be backed by a stored artifact.

## Wording
- Say: **"verified against the listed test cases"** (for public samples), or "verified against the agreed test cases, with final acceptance on your data" (for engagements).
- Never say: "behaves the same", "100% compatible", "production-ready", "guaranteed", "fully automated".
- Effort figures are **P50/P90 ranges**, never single numbers. Unsampled cells are labelled **"judgment only"**.
- State engine results factually: what the engine converted, what it left, what a human changed. Do not rank or praise vendors.

## Predictions
- Predictions (P50/P90 hours per class-by-tier cell, plus the objects expected to fail) are committed to `predictions/` **before** any engine runs. The commit timestamp is the proof.
- Never edit a prediction after a run. The scorecard shows hits, partial hits and misses side by side.

## Numbers in the UI
- Every count, rate or total shown is computed from `pairs/` and `receipts/` at build time. No number is typed by hand into UI code or copy.
- When there is no data, show "no data yet", not zero.

## Neutral comparison
When a report compares paths, it compares all five: stay on SQL Server and wrap it, Babelfish, Aurora/PostgreSQL conversion, Azure, and rewrite. Staying put is always a valid outcome.
