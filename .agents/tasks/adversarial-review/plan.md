# Implementation Plan: adversarial review gate

Base: branch main, commit 9719595, no worktree. Owner decisions A1, B1, C1 are fixed. The object list is in `batches.md` (44 objects, 4 batches of 11). Design is chosen below; the spec files under `.kiro/specs/adversarial-review/` record it.

## Design decisions (chosen, not left open)

**Core rule.** Agents write inputs only. Expected values come from the original T-SQL (`capture()` in `src/cli/agreed-tests.ts`). The verdict is the engines' agreement on those inputs. The gate result is computed by code in `src/adversarial/gate.ts`; no agent output is read as pass/fail. Receipts say "N adversarial cases ran, 0 differed".

**Data model.** Adversarial cases are committed JSON, not an `ObjectSpec` field. Reason: the 44 specs are TypeScript with helper functions across nine `specs-*.ts` files, three agents would collide on them, and a separate file is visibly agent-written. The runner builds `{ ...spec, fixedCases: loadedCases }` at run time and leaves `SPECS` untouched, so step 2 and step 3 are unchanged.

Layout:
```
adversarial/<db>/<Schema.Object>.cases.json   attacker output (committed)
adversarial/<db>/<Schema.Object>.audit.json   auditor output (committed)
tests/<db>/<Object>.adversarial.expected.json  captured from the original T-SQL
tests/<db>/<Object>.adversarial.tsqlt.sql      (or .adversarial.sqlserver.sql for FOR JSON, ruling J1)
tests/<db>/<Object>.adversarial.pg.sql         each begins "-- AGENT-WRITTEN adversarial cases (not hand-derived)"
evidence/adversarial/<db>/<Object>.json       one per object, written only by the CLI
evidence/adversarial/reports/batch-<n>.md      human report, written only by the CLI
evidence/adversarial/status/batch-<n>.json     progress file for background runs
```
`adversarial/` is added to the layout in `.kiro/steering/structure.md`.

`cases.json`:
```ts
interface AdversarialFile { schemaVersion: 1; object: string; database: string;
  attacker: { model: string; at: string };            // ISO timestamp; model id the agent reports
  notApplicable?: Partial<Record<TrapId, string>>;    // attacker's reason a trap does not apply
  cases: AdversarialCase[] }
interface AdversarialCase { id: string /* "A01".. */; label: string; traps: TrapId[];
  reasoning: string;  // why the engines might disagree, naming the T-SQL vs PL/pgSQL mechanism
  regression?: boolean; // set when a case exposed a finding; never deleted
  fixedCase: { cutoffs?, args?, tables }  // FixedCase shape; bytes written as {"$hex":"..."}
}
type TrapId = "null-vs-empty" | "collation-case" | "trailing-spaces" | "dates-datetime" | "numeric-rounding" | "top-ties" | "identity-gaps";
```
Large row counts is not a TrapId: it is the step 3/4 volume run and is shown as such in the report.

`audit.json`:
```ts
interface AuditFile { schemaVersion: 1; object: string; database: string;
  auditor: { model: string; at: string };
  casesAudited: string[];                    // ids; must equal the attacker's ids at run time
  acceptedNotApplicable: TrapId[];           // traps the auditor accepts as not applicable
  equivalentMutants: Array<{ name: string; reason: string }>;  // planted defects the auditor judges unobservable
  objections: Array<{ id: string; caseId?: string; kind: "not-an-attack"|"trap-uncovered"|"label-mismatch"|"duplicate"|"weak"|"other";
    text: string; status: "open"|"resolved"; resolution?: string; confirmedBy?: { model: string; at: string } }> }
```
An objection counts as resolved only when `status = "resolved"` and `confirmedBy` is set. The auditor never gives a verdict.

**Deterministic checks of "label matches what was sent"** (`src/adversarial/traps.ts`): for each trap a case claims, a function inspects the case's actual input values (table rows and args) and returns present/absent with detail. Examples: null-vs-empty needs both `''` and NULL in text inputs; collation-case needs two text values equal ignoring case; trailing-spaces needs a value ending in a space; dates-datetime needs a boundary date (1753-01-01, 9999-12-31) or a datetime value off the .000/.003/.007 grid or a cutoff equal to a row date; numeric-rounding needs a decimal/money value whose last fractional digit is 5; top-ties needs two rows sharing a non-key value; identity-gaps needs a non-contiguous pk run. A claimed trap that is absent from the input is a gate failure, whatever the auditor says. `applicableTraps(spec)` derives which traps apply from the spec's column kinds, params, `windowParams`, identity columns and setup; an applicable trap needs a covering case, or a `notApplicable` reason that the auditor lists in `acceptedNotApplicable`.

**Mutant adequacy.** The runner reuses the planted-defect loop of `runOne`, but runs only the adversarial cases against each mutant of the final PL/pgSQL (`spec.mutants`, else `autoMutants(finalSql)`). Result per object: caught, missed, skipped (not deployable), `equivalentRecorded` (missed but in `audit.equivalentMutants`). Verdict: `adequate` (no unexplained miss), `inadequate`, or `no-mutants` (shown on the report; does not block).

**Gate** (`gateResult(evidence)`, pure): passes only when all hold: every case ran on both engines; zero cases differed; zero invalid cases (original T-SQL raised an undeclared error, or a case failed validation); every claimed trap present in the input; every applicable trap covered or accepted; no open objection (resolved needs `confirmedBy`); `casesAudited` equals the case ids; mutant adequacy is not `inadequate`; evidence `conversionSha256` equals the sha256 of the pair record's `code.final`; attacker and auditor models are both recorded. `sameModel` is recorded and printed on the report when attacker and auditor models are equal (reported, not blocking, since a second model may not be available).

**Evidence JSON** `evidence/adversarial/<db>/<Object>.json`:
```ts
{ schemaVersion: 1, object, database, runAt, harnessVersion, conversionSha256,
  attacker: { model, at, file, sha256 }, auditor: { model, at, file, sha256 }, sameModel: boolean,
  traps: Record<TrapId, { applicable: boolean; coveredBy: string[]; notApplicableReason?: string; accepted?: boolean }>,
  cases: Array<{ id, label, traps, reasoning, trapChecks: Record<string,{present:boolean;detail:string}>,
    status: "ran"|"invalid", invalidReason?: string,
    sqlServer?: { passed: boolean; message?: string }, postgres?: { passed: boolean; message?: string }, differed: boolean }>,
  summary: { ran: number; differed: number; invalid: number },
  objections: AuditFile["objections"],
  mutantAdequacy: { verdict: "adequate"|"inadequate"|"no-mutants"; caught: string[]; missed: string[]; skipped: string[]; equivalentRecorded: string[] },
  gate: { passed: boolean; reasons: string[] },
  wording: string /* "N adversarial cases ran, M differed" */ }
```
The pair record gets `evidence.adversarial?: { gate: "pass"|"fail"|"not-run"; ran: number; differed: number; evidencePath: string; conversionSha256: string; runAt: string }` and `evidence.step5Method?: "adversarial-report"`, `evidence.step5Report?: string`. The CLI writes the first; only the approve CLI writes the other two.

**Status rule (only `src/pairs/status.ts`).** `computeStatus` and `missingForVerified` require `evidence.adversarial?.gate === "pass"` in addition to step 5. Consequence, stated in the ruling: the 7 records verified before the gate (reviewed by reading code) drop to `pending` until the gate runs and the owner approves on the report. That is the A1 requirement ("required for every object"), not a side effect to hide; receipts and README counts regenerate from `pairs/`.

**Approve CLI** (`npm run approve -- --report <path> --reviewer "<name>" --date <yyyy-mm-dd>`). Reads the objects listed in a batch report, re-evaluates `gateResult` from each object's evidence JSON (not from the report text), and refuses any object with a divergence, an unresolved objection, inadequate attacks, a stale `conversionSha256`, or a date not at least one day after the pair record's first commit (same rule as `log-effort.ts`, shared helper). It refuses to run unless stdin is a TTY and the reviewer retypes their name, so a workflow step cannot run it. All-or-nothing: one refused object stops the batch with a list. It records step 5 `pass`, reviewer, date, `step5Method`, `step5Report`, and recomputes status. `log-effort --review` (a pass, not `--fail`) is also refused when the gate is not `pass`.

**Findings.** If a case differs, the runner records it and the case stays. The remediation (a person or a coder step, never the CLI) follows REQ-4.3: keep Kiro's previous conversion as `conversions/<db>/<Object>.draft.sql` if none exists, fix `conversions/<db>/<Object>.sql` in the open, mark the case `regression: true`, re-run `npm run convert -- --object <obj>` (steps 1, 3, 4), then `npm run agreed-tests -- --object <obj>`, then the gate. If the object was verified, reset step 5 with the `.tmp/reset-step5.mjs` pattern and a note on the pair record. A case is never weakened.

**Automating human approval (options considered, not built).** Written into `design.md`. Mechanical Turk style pools cannot read PL/pgSQL against a collation checklist reliably; the data is public so confidentiality is not the blocker, competence is. Options in order of fit: the owner's batch approval CLI on a gate report (built); a GitHub pull request per batch with a required reviewer and signed commits; a named contractor reviewer using the same report, recorded as `reviewer`. All keep step 5 human.

## Ordered tasks

- [ ] 1. Record the rulings and spec. Add the ruling "(project owner, 2026-11-18, A1)" to `.kiro/steering/verification-standard.md` (gate between step 4 and step 5; step 5 = owner's review of the adversarial evidence report against the step-5 checklist, at least one day after the first pass; agents never record it; the verdict stays code-only). Add the `adversarial/` and `evidence/adversarial/` lines to `.kiro/steering/structure.md`. Create `.kiro/specs/adversarial-review/{requirements,design,tasks}.md` in the style of `step2-coverage/` (REQ numbering, design sections from this plan, tasks with checkboxes). Do not touch `product.md`; its claim "no language model in the pass/fail verdict" stays true and the ruling repeats why. Wording follows `claims-and-evidence.md` ("verified against the listed test cases", no "guaranteed").
  Files: the three steering/spec locations above.
  Verify: `npx vitest run` still passes (docs only); read the ruling back once for wording rules.

- [ ] 2. Shared checklist and trap definitions. Create `src/pairs/checklist.ts` exporting the 10 step-5 items as `{ id, text, trap?: TrapId, conditional?: "testsRun" }[]` (moved verbatim from `src/cli/review-packet.ts`), and change `review-packet.ts` to import it so the checklist exists once. Create `src/adversarial/schema.ts` (types above, `TrapId`), `src/adversarial/traps.ts` (`checkTrap`, `applicableTraps`), `src/adversarial/load.ts` (read and validate `cases.json`/`audit.json`; convert `{"$hex"}` to `Uint8Array`; run `inputCell()` from `src/agreed/generate.ts` on every value so an unsupported value fails early with its message; reject duplicate ids and labels).
  Files: `src/pairs/checklist.ts`, `src/cli/review-packet.ts`, `src/adversarial/{schema,traps,load}.ts`, `src/adversarial/{traps,load}.test.ts`.
  Verify: `npx tsc --noEmit` and `npx vitest run src/adversarial src/cli` pass; a unit test generates the review packet text and asserts the 10 checklist lines are unchanged.

- [ ] 3. Gate and adequacy logic, and the status rule. Create `src/adversarial/gate.ts` (`gateResult`, `adequacyVerdict`, all pure) and `src/adversarial/gate.test.ts` with one test per gate reason. Add `adversarial?`, `step5Method?`, `step5Report?` to `evidence` in `src/pairs/schema.ts`. Update `computeStatus` and `missingForVerified` in `src/pairs/status.ts` (add `"adversarial gate"` to the missing list). Update any existing test that builds a verified record (`src/pairs/*.test.ts`, `src/receipts/*.test.ts`) so it carries a passing gate.
  Files: `src/adversarial/gate.ts`, `gate.test.ts`, `src/pairs/schema.ts`, `src/pairs/status.ts`, affected tests.
  Verify: `npx vitest run` passes. Plant defects and require failures: add `scripts/mutants-adversarial.json` (e.g. gate passes with `differed > 0`; ignores open objections; ignores stale hash; trap check always true; adequacy treats missed as caught; status ignores the gate) and run `pwsh scripts/mutate-check.ps1 -File src/adversarial/gate.ts -Test src/adversarial/gate.test.ts -Mutants scripts/mutants-adversarial.json` (and one for `status.ts`): "0 missed". Run one command per call, to a new log file.

- [ ] 4. Extract the step-2 runner so the adversarial run reuses it. Move `checkTsqlt`, `runBatches`, `clearSs`, `capture`, `runOne` and the Outcome type from `src/cli/agreed-tests.ts` into `src/agreed/runner.ts` (exported), parameterised by `{ fileTag: "" | ".adversarial"; record: boolean; banner?: string; cases?: FixedCase[]; mutantsOnly?: boolean }`. `agreed-tests.ts` keeps `main()` and calls it with the defaults. Add an optional `banner` to the script `header()` in `src/agreed/generate.ts` (default unchanged, so existing generated files stay byte-identical). Capture per case in adversarial mode: a case whose original T-SQL raises an undeclared error is returned as `invalid` with the error text instead of stopping the run. Test names get the case id prefix (`[A01] ...`).
  Files: `src/agreed/runner.ts`, `src/cli/agreed-tests.ts`, `src/agreed/generate.ts`, `src/agreed/generate.test.ts`.
  Verify: `npm run build` (no harness process running), then `npm run agreed-tests -- --object dbo.ufnLeadingZeros > .tmp/regress-1.log 2>&1` and `git diff --exit-code tests pairs` shows no change (the refactor preserved output); `npx vitest run src/agreed` passes.

- [ ] 5. The `adversarial` CLI. Create `src/cli/adversarial.ts` with `run --batch <n> | --object <obj>`, `report --batch <n>`, and `check --object <obj>` (validation only, no engine, for attackers to use before committing). `run` reads `batches.md` for `--batch`, one object at a time (never two harness processes: it is one process, sequential, and writes `evidence/adversarial/status/batch-<n>.json` after each object). Per object: load cases and audit, run trap checks, run via `runner.ts` on both engines (tSQLt, or the client re-run for FOR JSON objects), run the adversarial-only mutant loop, build and write the evidence JSON, set `evidence.adversarial` on the pair record (never touching steps 1-6), and exit non-zero if any gate fails. Options `--dir`, `--evidence-dir`, `--no-record` for smoke tests. `report` builds `evidence/adversarial/reports/batch-<n>.md` from evidence JSON and pair records only: per object a header ("N adversarial cases ran, M differed", models, mutant adequacy, gate result) and a table mapping each of the 10 checklist items from `src/pairs/checklist.ts` to evidence (trap items to the case ids and trap checks; the "does what the T-SQL does" item to case counts plus the step 3 samples; "column-type mappings" to the pair record's mappings; "fixed cases would catch likely mistakes" to mutant adequacy; items no machine can settle, i.e. the "not claimed" notes and the expected-values-match-labels item, are marked "owner judgment" and list the notes or the label/expected pairs). The report ends with the exact `npm run approve` command. Add `"adversarial"` and `"approve"` scripts to `package.json`.
  Files: `src/cli/adversarial.ts`, `src/adversarial/{evidence,report}.ts` with tests, `package.json`.
  Verify: `npx vitest run src/adversarial` passes (report and evidence builders are unit tested on fixtures). Smoke run on one real object with a throwaway attacker file in `.tmp/adv-smoke/`: `npm run adversarial -- run --object dbo.ufnLeadingZeros --dir .tmp/adv-smoke --evidence-dir .tmp/adv-smoke/evidence --no-record > .tmp/smoke-1.log 2>&1` completes and writes evidence. Then the harness check (below).

- [ ] 6. Harness check before trusting it (verification-standard.md "Before trusting the harness"). In the smoke setup, plant a known defect in a copy of the conversion (swap `''` for NULL, or drop a `rtrim`) and a case that targets it; the run must report a divergence and the gate must fail. Also seed a case that targets nothing and confirm mutant adequacy reports `inadequate`. Keep the outputs as `evidence/adversarial/harness-check.txt` (committed).
  Files: `src/adversarial/harness-check.test.ts` (engine-free parts) and the evidence file.
  Verify: the smoke command shows the planted defect as a failure; `npx vitest run` passes.

- [ ] 7. Approve CLI and review guard. Create `src/pairs/review-rules.ts` (`firstCommitDate`, `earliestReviewDate`, `assertOneDay`) and use it from `src/cli/log-effort.ts` (behaviour unchanged) and the new `src/cli/approve.ts`. `approve` parses the batch report for its object list, re-reads each evidence JSON, runs `gateResult`, applies the refusal rules in the design, requires a TTY and a retyped reviewer name, then writes step 5. `log-effort --review` without `--fail` refuses when `evidence.adversarial.gate !== "pass"`. Agents and workflow steps never run `approve` (stated in `tasks.md` and every batch step prompt).
  Files: `src/pairs/review-rules.ts`, `src/cli/approve.ts`, `src/cli/log-effort.ts`, tests `src/pairs/review-rules.test.ts`, `src/cli/approve.test.ts` (pure decision function, no TTY).
  Verify: `npx vitest run` passes, including a test that a non-TTY invocation exits non-zero without writing, and mutants for the decision function caught via `mutate-check.ps1`.

- [ ] 8. Receipts and UI. Add `adversarial` to `ReceiptFile.evidence` in `src/receipts/schema.ts`, copy it in `src/receipts/builder.ts` (cases ran, differed, models, mutant adequacy, gate, evidence path, "agent-written" flag), and render a section in `web/app.js` next to `testsHtml`: "Adversarial review (agent-written cases, run on both engines)", with "N adversarial cases ran, M differed" built from the data, one line per case (label, trap, both engines' result), and "no data yet" when absent. Step 5's `stepDetail` shows "on the adversarial report" when `step5Method` is set. No number is typed in the UI.
  Files: `src/receipts/schema.ts`, `src/receipts/builder.ts`, `src/receipts/builder.test.ts`, `web/app.js`.
  Verify: `npx vitest run src/receipts` passes; `npm run build` then `npm run receipts:build` then `npm run site:check` pass.

- [ ] 9. Commit the tooling (explicit paths, no trailers, no push). Then run the four batches. For each batch n in 1..4, in order and never in parallel: (a) ATTACKER step writes `adversarial/<db>/<Obj>.cases.json` for the 11 objects of `batches.md`, using `npm run adversarial -- check --object <obj>` until valid, commit; (b) AUDITOR step (a different model if the workflow offers one; both record their model id) writes `<Obj>.audit.json` and commits; (c) RUN step starts `npm run adversarial -- run --batch n` as a background process with output to a new log file, polls `evidence/adversarial/status/batch-n.json`, then `report --batch n`, `npm run receipts:build`, commits evidence, tests and pair records. A divergence is handled as a finding (design section above) and the run repeated; nothing is weakened. The run step does not edit cases or audit files and never runs `approve`.
  Verify per batch: `evidence/adversarial/<db>/<Obj>.json` exists for all 11 objects; `git status --short` clean after the commit; the report lists every object; `npm run site:check` passes.

- [ ] 10. Remediation pass for open objections and inadequate attacks across all batches (skipped when none): attacker revises the named cases, auditor confirms or re-objects (writes `confirmedBy`), the run step re-runs `adversarial run --object` for the touched objects and rebuilds the reports. Then `npm run receipts:build` (regenerates the README status block) and a final full `npx vitest run`, `npm run build`, `npm run site:check`. The owner approves later with `npm run approve`; this plan never does.

## Digest

Read at base 9719595. Build: `npm run build` (`tsc`). Tests: `npx vitest run` (`vitest.config.ts` exists; I did not read it). Site checks: `npm run site:check`. tsconfig: `module NodeNext`, `rootDir src`, strict, so new files use `.js` import suffixes and JSON is read with `readFileSync` (as `agreed-tests.ts` does), not `import`. I did not run the tests or the build; I did not confirm which tests pass today.

| File | Block to change | Covered by |
|---|---|---|
| `src/pairs/status.ts` | `computeStatus(e)` (lines 16-24) and `missingForVerified(e)` (lines 27-36): add the gate condition | new `src/pairs/status.test.ts` (none exists today for status; check with the file search before creating) |
| `src/pairs/schema.ts` | `PairRecord.evidence` (ends with `harnessVersion`, `reviewer?`, `reviewDate?`): add `adversarial?`, `step5Method?`, `step5Report?` | tsc, status tests |
| `src/cli/log-effort.ts` | `firstCommitDate` (copy in this file) moves to `src/pairs/review-rules.ts`; `--review` branch (`reviewer !== undefined`) gets the gate refusal for a pass | `src/pairs/review-rules.test.ts` |
| `src/cli/review-packet.ts` | the ten `- [ ]` lines in the `lines` array (nine fixed plus one conditional on `e.testsRun?.length`) move to `src/pairs/checklist.ts` | checklist test comparing the generated packet |
| `src/cli/agreed-tests.ts` | `checkTsqlt`, `runBatches`, `clearSs`, `capture`, `Outcome`, `runOne`, `recordStep2` move or become parameterised in `src/agreed/runner.ts`; `main()` stays. `runOne` builds file names from `${label}`, writes `.tsqlt.sql`/`.pg.sql`/`.sqlserver.sql` and the mutant loop uses `spec.mutants` else `autoMutants(finalSql)` | byte-identical regeneration of `tests/` for `dbo.ufnLeadingZeros`; `src/agreed/*.test.ts` |
| `src/agreed/generate.ts` | `header(spec, kind, ...)` used by `tsqltScript`, `ssClientScript`, `pgScript`; `testName(index, label)`; `inputCell(value, type)`; `unsupportedFeatures(spec)` refuses specs with no `fixedCases` | `src/agreed/generate.test.ts` |
| `src/harness/generic/spec.ts` | read only: `FixedCase { label, cutoffs?, args?, tables }`, `Mutant { name, from, to }`, `ColType` kinds drive `applicableTraps` | unit tests of `traps.ts` |
| `src/conversions/specs.ts` | read only: `SPECS`, `specByName(qualified)` | used by `run` |
| `src/receipts/builder.ts` | the `evidence: { ... }` object built per pair (lines about 95-115) | `src/receipts/builder.test.ts` |
| `src/receipts/schema.ts` | `ReceiptFile.evidence` | builder test |
| `web/app.js` | `stepDetail` (line 160), `testsHtml` (line 195) and the template that places the sections | `npm run site:check` (`scripts/check-site.mjs`) |
| `package.json` | scripts block: add `adversarial`, `approve` | `npm run build` |
| `scripts/mutate-check.ps1` | read only; new mutants JSON `scripts/mutants-adversarial.json` follows `{name, from, to}` | the script's own "0 missed" output |

Pair state at base (from `pairs/`): 44 objects selected, 37 pending, 7 verified (`Sales.vSalesPerson`, `Integration.GetMovementUpdates`, `Integration.GetOrderUpdates`, `Website.ActivateWebsiteLogon`, `Website.CalculateCustomerPrice`, `Website.ChangePassword`, `Website.RecordVehicleTemperature`). The shell-hang constraint applies to every command in the plan: one command per call, new log file, check state before retrying.
