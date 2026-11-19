# adversarial-review requirements
**Scope item:** 4 (verification harness), the gate before step 5 of `verification-standard.md` (ruling A1, 2026-11-18).
**Goal:** a "pass" is hard to earn by accident. One agent attacks each conversion with inputs, a second agent audits the attacks, the engines decide, and the owner reviews the evidence report for step 5.
Builds on `step2-coverage` (`src/agreed/`, `npm run agreed-tests`).

## Requirements
### REQ-1 Agents write inputs only
1. Attack cases are committed JSON (`adversarial/<db>/<Schema.Object>.cases.json`), in the `FixedCase` shape plus an id, a label, the traps claimed and a reasoning text naming the T-SQL versus PL/pgSQL mechanism.
2. Expected values are captured from the original T-SQL. No agent writes an expected value.
3. A case whose original T-SQL raises an undeclared error is `invalid` and blocks the gate until the attacker replaces it.

### REQ-2 The gate is code
1. `gateResult` (`src/adversarial/gate.ts`) passes only when: every case ran on both engines; zero cases differed; zero invalid cases; every claimed trap is present in the case input (`traps.ts`); every applicable trap is covered or accepted as not applicable; no open objection (resolved needs `confirmedBy` from the auditor model; the attacker cannot confirm); audited ids equal case ids; mutant adequacy is not `inadequate`; the evidence hash equals the hash of the pair record's final conversion; attacker and auditor models are recorded.
2. Equal attacker and auditor models are reported (`sameModel`), not blocking.

### REQ-3 Audit
1. The auditor lists objections (not an attack, trap uncovered, label mismatch, duplicate, weak, other). The auditor never gives a verdict.
2. An objection is resolved only with status `resolved` and a `confirmedBy` entry whose model is the auditor's.

### REQ-4 Findings
1. A case that differs stays, marked `regression`; the conversion is fixed in the open (draft kept), steps 1, 3 and 4 and the agreed tests are re-run, and a verified object's step 5 is reset with a note. A case is never weakened.

### REQ-5 Recording
1. The CLI writes `evidence.adversarial` on the pair record. Only the approve CLI (TTY, retyped reviewer name) writes `step5`, `step5Method` and `step5Report`. Agents never run it.
2. `src/pairs/status.ts` is the only place the rule lives; `verified` needs gate `pass`.

### REQ-6 Wording
1. Receipts say "N adversarial cases ran, M differed" and label the cases agent-written. No "guaranteed", "100%" or "behaves the same".
