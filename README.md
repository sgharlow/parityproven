# ParityProven

Proves T-SQL to PL/pgSQL conversions object by object, and shows the evidence as a migration receipt.

Hackathon: [Kiroween 2026](https://kiroween.devpost.com/) — category **Resurrection** — due **Dec 4, 2026 2:00 pm PT**.

**Status:** harness, inventory scorer, predictions tooling and receipts site are built. The conversion loop is in progress; see `receipts/index.json` for what has been converted and what has not.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
- [Node.js 22+](https://nodejs.org/)
- A `.env` file at the repo root (copy from `docker/.env.example` and fill in passwords)

```
cp docker/.env.example .env
# then edit .env and set MSSQL_SA_PASSWORD and PG_PASSWORD
```

- `MSSQL_SA_PASSWORD`: at least 8 characters with upper case, lower case, a digit and a symbol.
- `PG_PASSWORD`: any non-empty string.

---

## Run it

```sh
docker compose -f docker/compose.yml --env-file .env up --detach --wait
npm ci
npm run build

npm run convert -- --object Integration.GetOrderUpdates   # one object
npm run verify                                            # every object (same as: convert --all)
pwsh scripts/run-all.ps1                                  # every object, one process each, time-limited
npm run convert -- --object Integration.GetOrderUpdates --seed 933137090   # replay a run

# receipts: the inventories are generated from the restored databases, not committed
npm run inventory -- --database WideWorldImporters
npm run inventory -- --database AdventureWorks2025
npm run dispositions          # pair records for objects recorded as not converted
npm run receipts:build
```

To run a second stack beside an existing one, set `MSSQL_PORT`, `PG_PORT` and `COMPOSE_PROJECT_NAME` in its `.env` (see `docker/.env.example`). Checked 2026-11-12 from a fresh clone on ports 14330/54320: all 41 objects gave the same step results as the committed pair records.

For each object, `convert`:

1. Restores WideWorldImporters from the pinned release asset (sha256 checked against `sources/manifest.json`).
2. Creates a scratch SQL Server database and deploys the **original T-SQL unchanged**. Its tables hold only the columns the object references, with no foreign keys and no existing rows.
3. Creates the matching PostgreSQL tables and, if `conversions/<db>/<Object>.draft.sql` exists, runs the property against the engine's **first draft** and records the result.
4. Deploys the final conversion (verification step 1) and runs a seeded fast-check property: generated rows are loaded into both engines, each object runs on its own engine through its own client, and results are compared on row count, column names, values and order (order only where the source `ORDER BY` guarantees it; ties compare as multisets).
5. Requires every **planted defect** (mutant of the final conversion) to be reported as failing. A harness that has never been seen failing is not evidence. Objects that declare no defects get two generated ones (`src/conversions/automutants.ts`).
6. Refuses to record a pass if too few samples returned any rows (the property would be vacuous).
7. Writes `pairs/<db>/<Object>.json` with the step 1, 3 and 4 results. Steps 2, 5 and 6 stay `not-run` until they are actually performed.

8. Measures **step 4**, runtime within 1.5×: the same synthetic volume is loaded into both engines, and server-side execution time is compared (`SET STATISTICS TIME` vs `EXPLAIN ANALYZE`, median of 7). The full result set at volume is compared too.

Then `npm run receipts:build` renders the pair records into `receipts/`, which the static site in `web/` displays.

### Other commands

```sh
npm run scaffold -- --database AdventureWorks2025 --type V      # catalog/<db>/*.json from SQL Server's own metadata
npm run draft-view -- --object Sales.vStoreWithAddresses         # mechanical first draft of a plain view
npm run log-effort -- --object Sales.vSalesPerson --minutes 20   # add human review time
npm run log-effort -- --object Sales.vSalesPerson --review "Name" --date 2026-11-12   # record step 5
npm run predictions:score -- --database WideWorldImporters       # predicted vs actual, incl. unpredicted failures
pwsh scripts/run-all.ps1                                         # every object, one at a time, time-limited
```

An object becomes **verified** only when steps 1–4 pass and step 5 (a second review at least a day after the first pass) is recorded. Step 2 (tSQLt/pgTAP) is not implemented yet, so no object is verified today.

### Known limits

- `datetime2(7)` holds 100 ns ticks and PostgreSQL `timestamp` holds 1 µs. Generated datetime values (and cutoffs) are normalised to microseconds on both engines. The number of values that changed is recorded in each pair record as a finding; the harness does not claim equivalence for sub-microsecond inputs.
- Tie order inside an `ORDER BY` key is compared as a multiset when the tie-breaker is not an output column.
- `WITH EXECUTE AS OWNER` has no PostgreSQL equivalent and is omitted; each pair record notes it.
- The scratch database uses the source database's collation. T-SQL `LIKE` is translated to a case-insensitive regular expression and CI_AS ordering to a tailored ICU collation; both are checked for the text the harness generates (ASCII plus a few accented characters), not for every collation rule.
- Objects that change data (`stateCheck`) are compared on outcome (including the error class raised) and table state; step 4 is not run for them. Values written with `SYSDATETIME()` are compared as "the call's time" on each engine's own clock, not to the microsecond.
- The scratch database also takes the source database's compatibility level (WideWorldImporters: 130), which changes several T-SQL behaviours (JSON functions among them).
- Objects that are not converted are listed with their reasons in `src/conversions/dispositions.ts`: one is recorded as a failure (`npm run dispositions` writes its pair record) and the rest are shown on the scorecard as out of scope.

---

## Repository structure

```
.kiro/            Steering docs, specs and hooks (never gitignored — required by the hackathon)
src/
  harness/        Database clients, restore, and generic/ (spec types, data generation, comparison, run)
  conversions/    specs.ts: the tables and planted defects for each converted object
  inventory/      Object inventory and complexity tiering
  predictions/    Pre-registered prediction schema, validation and scoring
  receipts/       Builds receipt JSON from pair records
  pairs/          PairRecord schema (single definition) and diff helper
  cli/            convert, inventory, predictions, receipts, validate-pair
docker/           compose.yml (SQL Server 2025 + PostgreSQL 18) and schema bootstrap
sources/          manifest.json: pinned public inputs with sha256 and licence
conversions/      PL/pgSQL conversions (<Schema>.<Object>.sql, optional .draft.sql for the engine's first draft)
predictions/      Pre-registered predictions (append-only)
pairs/            Pair records (JSON), one per object
receipts/         Generated receipt JSON consumed by web/
web/              Static receipts site and questionnaire
```

---

## Pre-existing work and disclosures

- Steering docs in `.kiro/steering/` were drafted with Claude Code on 2026-11-03, before Kiro credits arrived. Later Claude edits to steering are listed in the planning notes and will be disclosed in the submission.
- Sample databases: WideWorldImporters from `microsoft/sql-server-samples` (MIT licence, confirmed 2026-11-04). See `sources/manifest.json`.
- Babelfish Compass (Apache-2.0) is used as a compatibility assessment tool only; its output is stored as evidence and never treated as the conversion answer.

---

## License

Apache-2.0. See [LICENSE](LICENSE).
