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
docker compose -f docker/compose.yml --env-file .env up --detach
npm install
npm run build

npm run convert -- --object Integration.GetOrderUpdates   # one object
npm run verify                                            # every object (same as: convert --all)
npm run convert -- --object Integration.GetOrderUpdates --seed 933137090   # replay a run
```

For each object, `convert`:

1. Restores WideWorldImporters from the pinned release asset (sha256 checked against `sources/manifest.json`).
2. Creates a scratch SQL Server database and deploys the **original T-SQL unchanged**. Its tables hold only the columns the object references, with no foreign keys and no existing rows.
3. Creates the matching PostgreSQL tables and, if `conversions/<db>/<Object>.draft.sql` exists, runs the property against the engine's **first draft** and records the result.
4. Deploys the final conversion (verification step 1) and runs a seeded fast-check property: generated rows are loaded into both engines, each object runs on its own engine through its own client, and results are compared on row count, column names, values and order (order only where the source `ORDER BY` guarantees it; ties compare as multisets).
5. Requires every **planted defect** (mutant of the final conversion) to be reported as failing. A harness that has never been seen failing is not evidence.
6. Refuses to record a pass if too few samples returned any rows (the property would be vacuous).
7. Writes `pairs/<db>/<Object>.json` with step 1 and step 3 results and status `pending`. Steps 2, 4, 5 and 6 stay `not-run` until they are actually performed.

Then `npm run receipts:build` renders the pair records into `receipts/`, which the static site in `web/` displays.

### Known limits

- `datetime2(7)` holds 100 ns ticks and PostgreSQL `timestamp` holds 1 µs. Generated datetime values (and cutoffs) are normalised to microseconds on both engines. The number of values that changed is recorded in each pair record as a finding; the harness does not claim equivalence for sub-microsecond inputs.
- Tie order inside an `ORDER BY` key is compared as a multiset when the tie-breaker is not an output column.
- `WITH EXECUTE AS OWNER` has no PostgreSQL equivalent and is omitted; each pair record notes it.

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
