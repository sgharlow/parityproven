---
inclusion: always
---

# Tech stack and constraints

## Decided
- **Language:** TypeScript (strict), Node.js 22, ESM. One language across the scorer, harness, CLI and UI.
- **Source database:** SQL Server in Docker (`mcr.microsoft.com/mssql/server:2025-latest`; AdventureWorks uses SQL Server 2025 features), with **tSQLt** for source-side unit tests.
- **Target database:** PostgreSQL in Docker (`postgis/postgis:18-3.6`, the official PostGIS build of `postgres:18`; PostGIS added 2026-11-09 by the project owner so SQL Server `geography` has an equivalent), with **pgTAP** for target-side unit tests.
- **Property-based testing:** `fast-check`. Result-set equivalence is the core property (see `verification-standard.md`).
- **Unit tests:** Vitest.
- **Engine evidence:** Babelfish Compass, always run with `-noupdatechk` so it makes no network call. Its report is stored as evidence and never treated as the answer. Compass is a compatibility *assessment* tool for Babelfish for PostgreSQL. It does not produce PL/pgSQL; its `-rewrite` option produces Babelfish-compatible T-SQL.
- **Converter (T-SQL to PL/pgSQL):** Kiro. Kiro's first draft is the pair record's `engineOutput`, with the model and version recorded as the engine; every human fix is the diff to `final`. An object converted entirely by hand records `engine = "hand-written"`.
- **Database clients:** `mssql` for SQL Server and `pg` for PostgreSQL.

## Proposed (confirm in the relevant spec)
- **Receipts UI:** a static web app that renders committed receipt JSON. The harness runs locally, and the hosted site only displays its outputs, so no database is exposed publicly. Framework to be chosen in the UI spec.
- **Questionnaire scan:** scored entirely in the browser. Answers are never sent to or stored on a server.
- **Hosting:** a static host that stays up through Jan 29, 2027 (the end of judging).

## Constraints
- No secrets in the repo. Database passwords live in `.env` (gitignored), and the containers are local only.
- The harness must run from a clean checkout with one command (`docker compose up` plus a CLI command). The repository README documents it.
- Every generator and test run takes a **seed**, and the seed is recorded in the receipt so any failure can be reproduced.
- Pin tool versions. Record the harness version and engine version in every pair record.
- Prerequisites on the dev machine: Docker Desktop (for both databases) and a Java runtime (for Babelfish Compass). Docker Desktop must be running before any harness command.
- Column-type mapping is part of the conversion. `datetime2(7)` stores 100 ns ticks and PostgreSQL `timestamp` stores microseconds, so loading the same generated value into both engines can change it. The harness records each mapping and reports any load-time difference as a finding.
- tSQLt installs a CLR assembly. Its support on the SQL Server 2025 Linux image is unproven; prove it before relying on verification step 2.
