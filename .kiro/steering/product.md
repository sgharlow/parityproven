---
inclusion: always
---

# Product: ParityProven

## The problem
Free conversion engines (AWS Transform, DMS Schema Conversion, Babelfish Compass, GitHub Copilot app modernization) now convert much legacy SQL Server and .NET Framework code. Each one reports what it converted. AWS Transform for SQL Server also runs its own functional-equivalence checks, and when its tests are inconclusive "an LLM assessment via Amazon Bedrock evaluates functional equivalence to reach a final verdict" (AWS .NET blog, 2026-06-04). Its public pages do not say whether those tests can be exported and re-run outside AWS. ParityProven's evidence is different in kind: deterministic tests and a receipt per object that anyone can re-run from the public repo, with no language model in the pass/fail verdict. Buyers still have to decide what to convert, and prove that it worked.

## What we build
A toolkit that **checks** a conversion, object by object, against the original, and shows the evidence as a **migration receipt**. "Verified" is a status an object earns by passing all six steps of `verification-standard.md`.

1. **Inventory and score.** Parse a SQL Server database's programmable objects, then classify each one by class and complexity tier.
2. **Predict first.** Commit P50/P90 effort predictions and the expected failures *before* any engine runs.
3. **Convert.** Engine output is evidence, not the answer. Every human fix is recorded as a translation pair.
4. **Verify.** Run the original on SQL Server and the conversion on PostgreSQL, then compare result sets on generated data built to hit the known traps (see `verification-standard.md`).
5. **Receipt.** One page per object showing source, engine output, final code, diff, tests, pass or fail, and the human minutes it took. One scorecard compares predicted with actual.

## Who it is for
- CTOs, CIOs and IT directors at mid-market companies with SQL Server 2016-era estates facing end of support and rising Extended Security Update costs.
- PE operating partners who need a defensible modernization estimate for a portfolio company.
- Migration engineers who want a repeatable way to check a conversion and show the evidence.

## Hackathon scope (Kiroween 2026, Resurrection category; due Dec 4, 2026)
- In: T-SQL procedures, functions, views and triggers from public sample databases (WideWorldImporters, AdventureWorks) converted to PostgreSQL PL/pgSQL (triggers are inventoried and listed as not attempted; AdventureWorks work stopped 2026-11-12, decision G2); the verification harness; pair capture; the receipts UI; a questionnaire scan page.
- Deferred (R18, confirmed M7B 2026-11-12): a read-only MCP server over synthetic data (the Agent Access Map). Not part of the Dec 4 entry.
- Out: .NET application conversion, SSRS reports, VB6, any customer code, any hosted service that stores code.

## Principles
- **Show evidence, don't claim.** Nothing is called verified unless it passed the standard. Misses are shown, never hidden.
- **Neutral.** Engines are inputs. We never rank vendors or recommend one by default.
- **Public and synthetic only.** Inputs come only from the sources listed in `sources-and-data.md`.
