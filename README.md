# ParityProven

Proves T-SQL to PL/pgSQL conversions object by object, and shows the evidence as a migration receipt.

Hackathon: [Kiroween 2026](https://kiroween.devpost.com/) — category **Resurrection** — due **Dec 4, 2026 2:00 pm PT**.

**Status:** `harness-mvp` spec in progress. Gate `harness-pbt-green` target: 2026-11-18.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
- [Node.js 22+](https://nodejs.org/)
- A `.env` file at the repo root (copy from `docker/.env.example` and fill in passwords)

```
cp docker/.env.example .env
# then edit .env and set MSSQL_SA_PASSWORD and PG_PASSWORD
```

Password requirements:
- `MSSQL_SA_PASSWORD`: at least 8 characters, must include uppercase, lowercase, digit, and special character.
- `PG_PASSWORD`: any non-empty string.

---

## Run sequence (harness-mvp)

```sh
# 1. Start both database containers
docker compose -f docker/compose.yml up --detach

# 2. Install dependencies (first time only)
npm install

# 3. Build
npm run build

# 4. Run the equivalence verification
npm run verify
```

The verify command:
1. Waits for both containers to be healthy
2. Restores WideWorldImporters from the pinned release asset (checks sha256 first)
3. Runs the **defect check** — confirms the naive conversion is detected as wrong
4. Runs 100 fast-check samples of the `Integration.GetMovementUpdates` equivalence property
5. Prints the seed and a pass/fail summary

**Expected output:**
```
ParityProven harness-mvp verify
================================
[1/4] Checking Docker containers…
      Both containers healthy.
[2/4] Ensuring WideWorldImporters is restored…
[3/4] Running defect check (naive conversion must be detected)…
Defect check PASSED: naive conversion detected as wrong. First finding: ...
[4/4] Running equivalence property (seed: XXXXXXXXX)…

harness-pbt-green: PASS (seed: XXXXXXXXX, rows compared: NNN)
```

### Reproduce a specific run

```sh
npm run verify -- --seed 1234567890
```

### Verbose output

```sh
npm run verify -- --verbose
```

---

## Repository structure

```
.kiro/            Steering docs, specs and hooks (never gitignored — required by the hackathon)
  specs/
    harness-mvp/  Requirements, design and tasks for the equivalence harness
src/
  harness/        Database clients, generators, comparator, property, defect check, restore
  pairs/          PairRecord schema (single definition; all other files import it)
  cli/            verify.ts — the harness entry point
docker/
  compose.yml     SQL Server 2025 + PostgreSQL 18 with health checks
  pg-init/        DDL and functions applied to PostgreSQL on first start
sources/
  manifest.json   Pinned public inputs with sha256 and license
conversions/
  WideWorldImporters/   Hand-written PL/pgSQL conversions and diffs
pairs/
  WideWorldImporters/   Verified pair records (JSON)
```

---

## Pre-existing work and disclosures

- Steering docs in `.kiro/steering/` were drafted with Claude Code on 2026-11-03, before Kiro credits arrived. Kiro is used for the spec workflow, hooks, and all product code.
- Sample databases: WideWorldImporters from `microsoft/sql-server-samples` (MIT license, confirmed 2026-11-04). See `sources/manifest.json`.
- Babelfish Compass (Apache-2.0) used as a compatibility assessment tool only; its output is stored as evidence and never treated as the conversion answer.

---

## License

Apache-2.0. See [LICENSE](LICENSE).
