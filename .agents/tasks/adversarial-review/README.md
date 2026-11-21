# adversarial-review workflow files

Task files written by the Kiro workflow that built the adversarial review gate (run `wf_15965d81f6656525`, 2026-11-18 and 2026-11-19; the agent roles in its steps are Kiro's built-in workflow agents, not custom agent definitions). They are kept as the evidence behind the write-up's "Kiro workflows with sub-agents".

- Committed unchanged, after a content check on 2026-11-20 (no secrets, e-mail addresses, connection strings, local user paths or row data; two keyword matches were prose: "CLIs read .env" and the object name ChangePassword). Under decision D2 (owner, 2026-11-20).
- `task.json` still says `"status": "pending"`. The workflow never updated it. The work is recorded in the commits named in `.kiro/specs/adversarial-review/tasks.md`; `verdict.json` and `review.md` hold the final review of the run.
- A second workflow (`wf_d4feda0b77ab65fb`, 2026-11-19, remediation of 8 objects) left no files here. Its work is in commits c31c8c1, e4824dc and b78c56a.
