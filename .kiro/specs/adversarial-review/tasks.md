# adversarial-review tasks
Requirements: `requirements.md`. Design: `design.md`. Agents and workflow steps never run `npm run approve` or `log-effort --review`, and never record step 5.

- [x] 1. Ruling A1 in `verification-standard.md`, layout in `structure.md`, this spec
- [x] 2. Shared checklist (`src/pairs/checklist.ts`), `src/adversarial/{schema,traps,load}.ts` with tests
- [x] 3. `src/adversarial/gate.ts` with tests, PairRecord evidence fields, gate rule in `status.ts`, planted-defect lists in `scripts/mutants-adversarial.json`
- [ ] 4. Extract the step-2 runner into `src/agreed/runner.ts`
- [ ] 5. `adversarial` CLI (`run`, `report`, `check`), evidence and report builders
- [ ] 6. Harness check: a planted defect is seen failing (`evidence/adversarial/harness-check.txt`)
- [ ] 7. Approve CLI and review guard
- [ ] 8. Receipts and UI section
- [ ] 9. Four batches: attacker, auditor, run
- [ ] 10. Remediation of open objections and inadequate attacks
