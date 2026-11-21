# adversarial-review tasks
Requirements: `requirements.md`. Design: `design.md`. Agents and workflow steps never run `npm run approve` or `log-effort --review`, and never record step 5.

- [x] 1. Ruling A1 in `verification-standard.md`, layout in `structure.md`, this spec
- [x] 2. Shared checklist (`src/pairs/checklist.ts`), `src/adversarial/{schema,traps,load}.ts` with tests
- [x] 3. `src/adversarial/gate.ts` with tests, PairRecord evidence fields, gate rule in `status.ts`, planted-defect lists in `scripts/mutants-adversarial.json`
- [x] 4. Extract the step-2 runner into `src/agreed/runner.ts` (6f760f5; file present 2026-11-20)
- [x] 5. `adversarial` CLI (`run`, `report`, `check`), evidence and report builders (6f760f5; `src/cli/adversarial.ts`, `src/adversarial/evidence.ts`, `src/adversarial/report.ts`)
- [x] 6. Harness check: a planted defect is seen failing (`evidence/adversarial/harness-check.txt`, 2026-11-19; the gate failed an attack that caught 0 of 1 planted defects)
- [x] 7. Approve CLI and review guard (a0132a8; TTY guard and owner-confirmed entries 77683ab; auditor-only confirmation and evidence hash ac924b0)
- [x] 8. Receipts and UI section (a0132a8: `src/receipts/builder.ts`, `web/app.js`; live on parityproven.com)
- [x] 9. Four batches: attacker, auditor, run (356c9bb, 3c75bfe, 1aadcac, 7af4c52; reports `evidence/adversarial/reports/batch-1..4.md`)
- [x] 10. Remediation of open objections and inadequate attacks (8acdeb5, b94074d, 8f39b14; second pass c31c8c1, e4824dc, b78c56a: gate pass for all 44, 0 differed; owner approval 4396287)
