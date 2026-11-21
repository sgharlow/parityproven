---
inclusion: always
---

# Repository structure

```
.kiro/            steering, specs and hooks (never gitignored; the hackathon requires it)
src/
  inventory/      T-SQL parsing, object classification, complexity tiering
  harness/        database clients, result-set diff, trap generators, PBT properties
  pairs/          translation-pair record schema, status rule, capture and validation
  agreed/         step 2: tSQLt and plain-SQL assertion scripts from an object's fixed cases, and the runner
  adversarial/    adversarial gate: schema, trap checks, gate rule, evidence and batch-report builders
  conversions/    specs (tables and planted defects per converted object), automutants, dispositions
  predictions/    prediction schema, validation and scoring
  mcp/            read-only MCP server and Agent Access Map
  facts/          figures for the submission from the committed records (npm run facts) and the draft fact-check
  specs/          test that every open box in a tasks.md has an 'open because' note
  receipts/       builds receipt JSON from pairs and evidence
  cli/            one entry point per npm script (convert, agreed-tests, adversarial, approve, receipts, ...)
conversions/      PL/pgSQL conversions, one file per object (optional .draft.sql for the engine first draft)`ncatalog/          object metadata scaffolded from SQL Server's own catalog`ntests/            step 2 expected results captured from the original T-SQL, and the generated test scripts`nscripts/          run-all, get-tsqlt, predeploy and site checks, site build`nweb/              receipts UI and questionnaire scan (static)
docker/           compose file and init scripts for SQL Server and PostgreSQL
sources/          manifest of public inputs: repo, commit, license, path
predictions/      pre-registered predictions; committed before any engine run, never edited after
pairs/            pair records (JSON), one file per object; status is verified, pending or failed (src/pairs/status.ts)
receipts/         generated receipt JSON consumed by web/
evidence/         raw engine output (e.g. the Babelfish Compass report), by run
adversarial/      agent-written attack cases and auditor objections, per object (<db>/<Schema.Object>.cases.json, .audit.json)
evidence/adversarial/  adversarial run evidence and batch reports; written only by the CLI
```

## Conventions
- File names are kebab-case. Types and interfaces are PascalCase. Functions are camelCase.
- One object, one pair file: `pairs/<database>/<schema>.<object>.json`.
- The pair record schema is defined in exactly one place (`src/pairs/schema.ts`). The CLI, receipts builder and UI all import it; none of them redefines it.
- Generated files (`receipts/`) are produced only by the CLI and never edited by hand.
- `predictions/` files are append-only. A correction is a new file that references the old one, so the original timestamp stays provable.
