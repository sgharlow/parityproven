# .agents: the Kiro workflow runs behind this repository

Three Kiro workflow runs did part of the building. All three used Kiro's built-in agents. No custom agent definition was written for them
(owner, ruling D5-N, 2026-11-23). This folder keeps what survives of each run so a reader can check the claim "Kiro workflows with sub-agents".

## The three runs

| Run | Dates (local) | Recipe and what it did | Agent steps | Models set in the definition | Commits that hold its work |
|---|---|---|---|---|---|
| `wf_ab80868736ef4504` | 2026-11-18, 13:18 to 14:08 | The "goal" recipe: an iterative loop toward one verifiable goal, here finishing the remaining spec work (step 2 tranche C and the Search follow-up) | wf-coder x1 | none set | 842efa5, ac98f8c, e8b8b0d, 900c44d, 25792fb, 07d05a4 |
| `wf_15965d81f6656525` | started the evening of 2026-11-18, finished 2026-11-19 | Built the adversarial review gate: spec, CLI, approve, receipts, four batches, remediation | wf-workflow-creator x2, wf-planner x1, wf-coder x19, semantic_reviewer x1 | claude-opus-5.5 (attacker steps), gpt-5.6-sol (auditor steps) | 6f760f5, a0132a8, 356c9bb, 3c75bfe, 1aadcac, 7af4c52, 8acdeb5, b94074d, 8f39b14, 77683ab, 81fcf18; the full list is in `.kiro/specs/adversarial-review/tasks.md` |
| `wf_d4feda0b77ab65fb` | 2026-11-19, 10:31 to 10:52 | Fixed 8 objects after the gate: new attack cases, a re-audit, a gate re-run | wf-workflow-creator x1, wf-coder x5 | claude-opus-5 (attacker step), gpt-5.6-sol (auditor step) | c31c8c1, 2f3dd03, e4824dc, b78c56a |

## What is in this folder

- `workflows/<run>.json`: the run's `workflow-definition.json`, copied byte for byte from `~/.kiro/sessions/<session>/workflows/<run>/`. SHA-256:
  - `wf_ab80868736ef4504.json`: `b23930a7d798b349d5307da07551adeee7963feba8493f537fc36b2fab57f3b1`
  - `wf_15965d81f6656525.json`: `050af5d4784345435e652dcd19b8deb430183ca6ba2e083c924f127e480c7a80`
  - `wf_d4feda0b77ab65fb.json`: `41d36d867ccc5348eae2a5ddd688989ee3140190fa9af658011dfd46468b2075`
- `tasks/adversarial-review/`: the task files of the second run (see its own README). The other two runs left no task files.

## What is deliberately not here

- The runs' `workflow-state.json` files. They carry `originalUserMessages`, the owner's chat text, and the runs' full transcripts. A repo test (`src/specs/workflow-files.test.ts`) fails if that key ever appears in this folder.
- The recipe inputs of the goal run (its prompt and iteration limit) live in that state file, so the definition shows the recipe, not the instruction it was given.

## Content check (2026-11-23, before copying)

Scanned for user paths, e-mail addresses, secrets, connection strings, the private planning repository, planning file names, the owner's name and employment terms: none found.
Two notes: `C:\source\parityproven` appears in the prompts of two definitions (it is this repository's workspace path on the owner's machine, not a user path), and the word "Opus"
is the model name in the attacker and auditor instructions of the third run.
