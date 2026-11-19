# adversarial-review design

## Core rule
Agents write inputs only. Expected values come from the original T-SQL (`capture()` in the step-2 runner). The verdict is the engines' agreement on those inputs. The gate is computed by `src/adversarial/gate.ts`; no agent output is read as pass or fail. Agent-written fields (objection status, trap accepted, equivalentRecorded) can only block; entries that unblock the gate are listed by `approve` and confirmed by the owner there. `approve` records the sha256 of each evidence file and the confirmed entries in the pair record (`step5EvidenceSha256`, `step5Confirmed`); `validate-pair` and a repo test flag any evidence file edited after approval. This keeps the claim in `product.md` ("no language model in the pass/fail verdict") true.

## Data model
Cases are committed JSON, not an `ObjectSpec` field: the 44 specs are TypeScript across nine `specs-*.ts` files, parallel agents would collide, and a separate file is visibly agent-written. The runner builds `{ ...spec, fixedCases: loadedCases }` at run time; `SPECS` is untouched, so steps 2 and 3 are unchanged.

```
adversarial/<db>/<Schema.Object>.cases.json   attacker output
adversarial/<db>/<Schema.Object>.audit.json   auditor output
tests/<db>/<Object>.adversarial.*             generated scripts and expected values
evidence/adversarial/<db>/<Object>.json       one per object, written only by the CLI
evidence/adversarial/reports/batch-<n>.md     human report
evidence/adversarial/status/batch-<n>.json    progress of background runs
```
Types are in `src/adversarial/schema.ts`. Bytes are written as `{"$hex":"..."}`. Large row counts is not a trap id: it is the step 3 and 4 volume run.

## Trap checks
`traps.ts` inspects a case's actual input values per claimed trap: null-vs-empty needs `''` and NULL in text inputs; collation-case needs two text values equal ignoring case; trailing-spaces needs a value ending in a space; dates-datetime needs a boundary date, a datetime value off the .000/.003/.007 grid, or a cutoff equal to a row date; numeric-rounding needs a decimal or money value whose last fractional digit is 5; top-ties needs two rows sharing a non-key value; identity-gaps needs a non-contiguous key run. A claimed trap absent from the input fails the gate whatever the auditor says. `applicableTraps(spec)` derives applicable traps from column kinds, params, window params and identity columns.

## Mutant adequacy
Only the adversarial cases run against each planted defect of the final PL/pgSQL. Verdicts: `adequate`, `inadequate` (an unexplained miss), `no-mutants` (shown, not blocking). A missed mutant listed in the audit's `equivalentMutants` is recorded, not counted.

## Status rule
`computeStatus` and `missingForVerified` in `src/pairs/status.ts` require `evidence.adversarial?.gate === "pass"`. Consequence: records verified before the gate drop to pending until the gate runs and the owner approves.

## Approve CLI
`npm run approve -- --report <path> --reviewer "<name>" --date <yyyy-mm-dd>` re-evaluates `gateResult` from evidence JSON, refuses any object with a divergence, an open objection, inadequate attacks, a stale hash or a date under one day after the first commit, needs a TTY and a retyped reviewer name, and is all-or-nothing.

## Automating human approval (options considered, not built)
Crowd platforms such as Mechanical Turk cannot read PL/pgSQL against a collation checklist reliably; the data is public so confidentiality is not the blocker, competence is. In order of fit: the owner's batch approval CLI on the gate report (built); a pull request per batch with a required reviewer and signed commits; a named contractor reviewer using the same report, recorded as `reviewer`. All keep step 5 human.
