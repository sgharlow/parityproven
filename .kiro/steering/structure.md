---
inclusion: always
---

# Repository structure

```
.kiro/            steering, specs and hooks (never gitignored; the hackathon requires it)
src/
  inventory/      T-SQL parsing, object classification, complexity tiering
  harness/        database clients, result-set diff, trap generators, PBT properties
  pairs/          translation-pair record schema, capture and validation
  receipts/       builds receipt JSON from pairs and evidence
  cli/            command entry points (inventory, predict, verify, capture, receipts)
web/              receipts UI and questionnaire scan (static)
docker/           compose file and init scripts for SQL Server and PostgreSQL
sources/          manifest of public inputs: repo, commit, license, path
predictions/      pre-registered predictions; committed before any engine run, never edited after
pairs/            verified pair records (JSON), one file per object
receipts/         generated receipt JSON consumed by web/
evidence/         raw engine output (e.g. the Babelfish Compass report), by run
```

## Conventions
- File names are kebab-case. Types and interfaces are PascalCase. Functions are camelCase.
- One object, one pair file: `pairs/<database>/<schema>.<object>.json`.
- The pair record schema is defined in exactly one place (`src/pairs/schema.ts`). The CLI, receipts builder and UI all import it; none of them redefines it.
- Generated files (`receipts/`) are produced only by the CLI and never edited by hand.
- `predictions/` files are append-only. A correction is a new file that references the old one, so the original timestamp stays provable.
