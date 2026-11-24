# adversarial-review workflow files

Task files written by the Kiro workflow that built the adversarial review gate (run `wf_15965d81f6656525`). They are kept as the evidence behind the write-up's "Kiro workflows with sub-agents". The other two runs left no files in this folder.

## The three workflow runs (owner's account, 2026-11-23, checked against the workflow definitions)

| Run | Dates (local) | What it did | Agent steps | Models set in the definition |
|---|---|---|---|---|
| `wf_ab80868736ef4504` | 2026-11-18, 13:18 to 14:08 | The "goal" recipe: finish the remaining spec work (step 2 tranche C and the Search follow-up). Commits 842efa5 to 07d05a4 | wf-coder x1 | none set |
| `wf_15965d81f6656525` | started the evening of 2026-11-18, finished 2026-11-19 | Built the adversarial review gate: spec, CLI, approve, receipts, four batches, remediation | wf-workflow-creator x2, wf-planner x1, wf-coder x19, semantic_reviewer x1 | claude-opus-5.5 (attacker steps), gpt-5.6-sol (auditor steps) |
| `wf_d4feda0b77ab65fb` | 2026-11-19, 10:31 to 10:52 | Fixed 8 objects after the gate (commits c31c8c1, e4824dc, b78c56a) | wf-workflow-creator x1, wf-coder x5 | claude-opus-5 (attacker step), gpt-5.6-sol (auditor step) |

- All agents are Kiro's built-in agents. No custom agent definition was written (owner confirmed, ruling D5-N, 2026-11-23).
- The workflow definitions and state files exist only on the owner's PC, under `~/.kiro/sessions/c7cae9a786585d2d/workflows/`. They are not in the repo. This folder holds the task files of the second run only.
- The model versions above come from the workflow definitions. The evidence files for the adversarial cases record the attacker only as "claude (Kiro subagent; exact model version not exposed to the agent)". Those evidence files are not edited: the owner's sign-off covers their hashes.

## Notes on these files
- Committed unchanged, after a content check on 2026-11-20 (no secrets, e-mail addresses, connection strings, local user paths or row data; two keyword matches were prose: "CLIs read .env" and the object name ChangePassword). Decision D2 (owner, 2026-11-20).
- `task.json` still says `"status": "pending"`. The workflow never updated it. The work is recorded in the commits named in `.kiro/specs/adversarial-review/tasks.md`; `verdict.json` and `review.md` hold the final review of the run.
