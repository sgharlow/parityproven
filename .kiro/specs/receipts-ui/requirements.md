# receipts-ui requirements

**Scope item:** 5 — Migration Receipts UI (KIROWEEN-PLAN.md).
**Goal:** a static web app with a live URL that shows one receipt per converted object and a predicted-vs-actual scorecard. A second page is a questionnaire scan.

Hosting must stay up through **2027-01-29** (end of judging). No database is exposed publicly — the site only renders pre-committed JSON from `receipts/` and `predictions/`.

---

## REQ-1 Receipt builder CLI

**User story:** As the CLI, I build receipt JSON from pair records and inventory data so the site has structured data to render.

**Acceptance criteria:**
1. `npm run receipts:build` reads every file in `pairs/**/*.json` and produces one file per object in `receipts/<database>/<schema>.<object>.json`.
2. Each receipt file contains:
   - All fields from the pair record
   - `objectInventory`: the matching entry from `inventory/<database>.json` (objectClass, tier, schemaName, objectName)
   - `predictionCell`: the matching `CellEstimate` from `predictions/<database>-v1.json` (p50Hours, p90Hours) — `null` if no predictions file exists yet
   - `verificationSteps`: human-readable labels for each of the 6 steps with pass/fail/not-run status
3. A `receipts/index.json` is produced listing all receipts with their status (pending/failed/verified), database, objectClass, tier.
4. The CLI exits 0 and prints a summary: `Built N receipts (M verified, K pending, J failed)`.

---

## REQ-2 Individual receipt page

**User story:** As a reviewer, I can open a receipt URL and see the full evidence for one converted object.

**Acceptance criteria:**
1. URL pattern: `/receipts/<database>/<schema>.<object>.html` (or a SPA route).
2. The page shows:
   - Object name, class, tier, database
   - Source T-SQL (syntax-highlighted)
   - Engine output and final PL/pgSQL (syntax-highlighted, side by side or tabbed)
   - Diff between engineOutput and final
   - Verification steps 1–6 with pass/fail/not-run badges
   - PBT seed(s) used, rows compared, load-time findings (if any)
   - Human minutes, engine name
3. A "not verified" banner is shown when `status !== "verified"`.
4. A "Re-run from public repo" section shows the exact CLI command to reproduce the PBT run.

---

## REQ-3 Scorecard page (index)

**User story:** As a visitor, I can see the predicted-vs-actual scorecard for all converted objects at a glance.

**Acceptance criteria:**
1. The index page (`/` or `/index.html`) shows the `predictions:score` table rendered as HTML.
2. It lists every receipt with its status badge (✅ verified / ⏳ pending / ❌ failed).
3. Each row links to its individual receipt page.
4. When no pair records exist, the page shows "No conversions yet — predictions committed, work in progress."

---

## REQ-4 Questionnaire scan page

**User story:** As a prospect, I can answer a short questionnaire and see a rough migration complexity estimate.

**Acceptance criteria:**
1. A second page at `/questionnaire.html` (or `/scan`).
2. Questions: object counts by type (procedures, functions, views, triggers), approximate complexity (% with dynamic SQL / cursors / cross-db refs). All answered with number inputs or sliders.
3. Scoring runs **entirely in the browser** — no data is sent to or stored on a server.
4. Output: a rough P50/P90 total-hours estimate based on the tier distribution from the real inventory data, with a note that it is "judgment only — no samples from your database."

---

## REQ-5 Static, no server, open source

**Acceptance criteria:**
1. The entire site is static HTML/CSS/JS — no server-side rendering, no database exposed publicly.
2. Built from committed JSON using the receipt builder CLI (`npm run receipts:build`).
3. The `web/` source and `receipts/` output are in the public repo under Apache-2.0.
4. The site works correctly with JavaScript disabled for the scorecard and receipt pages (progressive enhancement — questionnaire requires JS).

---

## Out of scope
- Authentication, user accounts, storing user data.
- Server-side rendering or any backend.
- Rendering pair records that haven't been built yet — the site shows whatever is in `receipts/` at build time.
