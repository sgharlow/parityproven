# submission-closeout requirements
**Scope item:** the Kiroween 2026 entry itself (`kiroween-submission.md`). Deadline **2026-12-04 2:00 pm PT**, no extensions.
**Goal:** every claim the entry makes is true at the commit that is submitted, every Kiro feature the write-up names has an artifact a judge can open, and the owner has what he needs to write the description, record the video and submit.
**Drafted by:** Claude Code on 2026-11-20 from a read-only review of the repo at `5e92f23`, the live site and the official rules (re-read 2026-11-20; page says "Updated November 16, 2026, to include residents of Australia"). Kiro reviews this spec, corrects it where the repo disagrees, and implements it. REQ-9 covers the disclosure.
**Not in scope:** new conversions, new harness features, any change to the status rule, the MCP tools or the adversarial gate logic.

Measured 2026-11-20 at `5e92f23` (clean, level with `origin/main`): tsc clean; vitest 257/257 (20 files, run from `C:\source\parityproven`); `predeploy:check` passes; `site:check` PASS on https://parityproven.com (55/55 links render a receipt); 55 pair records = 44 verified, 0 pending, 11 failed; live `receipts/index.json` matches the committed one.

## Phase 0 re-measurement (Kiro, 2026-11-20, at `5e92f23`)
Every "Found" line below was re-measured against the repo and the live site (script `.tmp/verify-found.mjs`, output kept in `evidence/closeout/0.1-found-lines.txt`). Result: all hold, with these corrections and additions.
- REQ-1: the fresh-clone run of commit `4396287` started 2026-11-19 21:22 (MST) stopped after 7 of 46 conversions because the Docker daemon was not running. No result exists, as REQ-1 says. That run is dead and is replaced by the run at the freeze commit (design.md, phase 4); its temporary clone and the `ppfresh` compose project are removed when Docker is up.
- REQ-2: confirmed. `adversarial-review/tasks.md` had 3 of 10 ticked; `conversion-loop/tasks.md` had one open box ("34 pending"; there are 0).
- REQ-3: confirmed. `.agents/tasks/adversarial-review/` holds 13 untracked files, `task.json` says `"status": "pending"`, `.agents` is not in `.gitignore`, and `.tmp/hook-runs.log` exists but is gitignored.
- REQ-4: confirmed. 44 approvals dated 2026-11-19, 44 gate runs stamped 2026-11-19, 14 conversions last changed 2026-11-18 (git), 41 of 44 verified receipts have 0 human minutes, 14 minutes logged in total.
- REQ-5: confirmed line by line, with one precision: `structure.md` already lists the top-level `adversarial/` and `evidence/adversarial/` folders; what it lacks is `src/adversarial`, `src/agreed`, `src/mcp`, `src/conversions`, and the top-level `catalog/`, `tests/`, `scripts/`. `tech.md` line 10 does say "pgTAP for target-side unit tests" and line 29 "support ... is unproven". The GitHub homepage is `https://parityproven.netlify.app`.
- REQ-6: confirmed on the live site: `favicon.ico` returns 404; `/`, `/about` and `/questionnaire` have no meta description, no Open Graph tags and no icon link.
- REQ-7: confirmed (99 commits, 8 specs, 44 verified at `5e92f23`).
## Requirements

### REQ-1 The fresh-clone run has a recorded result
Found: `kiroween-submission.md` ticks "All source code, assets and instructions needed to run it" with "started 2026-11-20 at commit 4396287; result is recorded ... when it finishes". No result is recorded in either repo.
1. A full run from a fresh anonymous clone of the submitted commit, on its own compose project and ports, is completed after the last code change: `npm ci`, build, tests, every converted object, inventories, tSQLt and step 2, the adversarial gate for the 44 verified objects, dispositions, receipts.
2. The result is committed under `evidence/fresh-clone/<date>-<commit>.txt`: commit, commands, test count, and a comparison of every pair record's step results, gate result and status with the committed record. Timings and seeds may differ; anything else that differs is a finding and is listed.
3. The checklist box stays unticked until that file exists. A box is never ticked on a run that has only started.
4. README's "Checked 2026-11-14 from a fresh clone of commit `a9ce6fc`" is replaced by the new date and commit.

### REQ-2 Spec task lists match what was built
Found: `adversarial-review/tasks.md` has 3 of 10 boxes ticked although items 4-10 are committed (`6f760f5`, `a0132a8`, batches `356c9bb` `3c75bfe` `1aadcac` `7af4c52`, remediation `8acdeb5` `b94074d` `8f39b14`, approval `4396287`). `conversion-loop/tasks.md` has one open box whose text says "34 pending"; there are 0 pending.
1. Each open box is checked against the repo. A box is ticked only with the commit or evidence file that satisfies it written beside it; a box that is not satisfied stays open with what is missing.
2. A unit test fails when a `tasks.md` under `.kiro/specs/` has an open box and no "open because" note on it, so the lists cannot drift again before the deadline.

### REQ-3 Every Kiro feature named in the write-up has an artifact in the repo
Found: workflows with sub-agents are claimed in `kiroween-submission.md`, but their task files (`.agents/tasks/adversarial-review/`, 13 files) are untracked and `task.json` still says `"status": "pending"`. Hook runs are logged only to the gitignored `.tmp/hook-runs.log`. "No custom agent definition was written (owner to confirm)" is still open.
1. The workflow task files are either committed (after a check for secrets, local user paths and anything `sources-and-data.md` forbids) or `.agents/` is added to `.gitignore`. The owner chooses. If committed, the write-up facts point at them.
2. One observed run of each hook is committed as evidence (`evidence/hooks/`): the saved file, the hook-log line, and the pair record change or validation output that followed.
3. A generated facts file (REQ-7) lists, for each feature the rules ask about (IDE/CLI/Web/Crew, custom agents, hooks, specs, steering, MCP, PBT, powers), either the artifact path and commit or the words "not used". Nothing is listed as used without a path.

### REQ-4 The step 5 claim is stated the way it was done
Found: (a) The standard says step 5 is "at least one day after the first pass". The guard (`src/pairs/review-rules.ts`) measures from the pair record's first commit. All 44 approvals are dated 2026-11-19; all 44 gate runs are stamped 2026-11-19 UTC; 14 of the 44 conversions were last changed on 2026-11-18. (b) The scorecard, the About page and the README say "a second human review"; ruling A1 makes step 5 one person's approval of an evidence report built from agent-written cases. (c) 41 of the 44 verified receipts show "Human effort: not logged"; 14 minutes are logged in total.
1. The owner rules what "first pass" means when a conversion changes after its first pass, and whether the 14 objects are approved again on a later date. The ruling goes into `verification-standard.md`; the guard and its tests follow the ruling.
2. Each verified receipt shows the date the reviewed conversion last changed, the gate run time and the review date, so a reader can check the interval.
3. Wording for step 5 on the scorecard, About page and README is proposed by Kiro in the terms of ruling A1 and applied only as the owner writes or approves it.
4. Human effort: the owner supplies the minutes spent on each batch report; they are recorded per batch and shown on the receipts as batch time, not divided into invented per-object figures. If the owner supplies none, the receipt says "review time not recorded" instead of "not logged".

### REQ-5 Steering, README and repo metadata agree with the repo
Found:
- `tech.md`: "pgTAP for target-side unit tests" and "tSQLt ... support on the SQL Server 2025 Linux image is unproven". Both are contradicted by the 2026-11-12 ruling and by step 2 passing for 46 objects.
- `structure.md`: `src/` list lacks `agreed/`, `adversarial/`, `mcp/`, `conversions/`, `predictions/`; CLI names are `predict, verify, capture`; "`pairs/` verified pair records" (11 are failed); `catalog/`, `conversions/`, `tests/`, `scripts/` missing.
- README: "The conversion loop is in progress"; step 5 recorded with `log-effort --review` (it is `npm run approve` now); "The rest need hand-derived fixed cases first, or use features the test generator does not cover yet (table-valued parameters, JSON results, geography and xml columns ...)" although those pass step 2; no `adversarial` or `approve` command listed; structure tree lacks `adversarial/`, `src/adversarial`, `src/mcp`; a list numbered 7 then 8 across a blank line.
- GitHub repo homepage is `https://parityproven.netlify.app`; everything else gives `https://parityproven.com`.
- `kiroween-submission.md`: "re-read 2026-11-13" (rules page updated 2026-11-16); "anonymous clone at 62bace8 passed ... 122/122"; the Social Blitz line omits that the post must share a favourite thing about Kiro and how it changed the approach to development.
1. Each line above is corrected to what the repo shows on the day, or removed.
2. The existing stale-README test is extended: it fails on a test count, verified count, spec/steering/hook count or commit hash typed by hand in README or steering outside a generated block.
3. The repo homepage is set to `https://parityproven.com`.

### REQ-6 The site reads well to a judge who gives it one minute
Found on the live site, 2026-11-20:
- Scorecard at 1280 px wide: the table's right edge is at 1304 px, so the page scrolls sideways.
- `favicon.ico` returns 404 (a console error on every page). No `meta description` and no Open Graph tags, so a link preview on Devpost or a social post is blank.
- The scorecard opens with "Migration Receipts", one sentence, then two dense disclosure paragraphs. Nothing above the table says what problem this solves or for whom, and nothing on the site or in the README says why the entry is in the Resurrection category. Stage one of judging is pass/fail on whether the project "reasonably fits the theme".
- Widths below 1280 px were not checked.
1. No page scrolls sideways at 1280, 1024, 768 or 390 px. `site:check` (or a new check beside it) measures this and fails when it does.
2. A favicon, a meta description and Open Graph title, description and image on every page. The image is generated from the repo's own numbers or carries none.
3. Above the scorecard table: what it is, who it is for, and the category fit, in at most three short lines; the disclosure notes move below the counts and stay complete. The words are the owner's (Kiro proposes, owner edits or approves, `predeploy:check` passes).
4. `claims-and-evidence.md` wording rules hold on every changed line.

### REQ-7 Facts for the owner's writing come from one generated file
Found: the write-up facts sheet in the planning repo was last measured 2026-11-17 (7 verified, 122 tests, 39 commits, 5 specs). Today: 44 verified, 257 tests, 99 commits, 8 specs. The current fact script is `.tmp/facts.mjs`, which is gitignored.
1. `npm run facts` writes `evidence/facts/submission-facts.md` from `receipts/index.json`, `pairs/`, `evidence/`, `.kiro/` and `git`: every number the description, write-up, video cards and social post may use, each with the command that derives it and the commit it was measured at.
2. It contains no sentences meant for pasting. Every word of the submission is the owner's (N1A, N4A).
3. `npm test` fails when the committed facts file is stale against the records.
4. A `fact-check` command takes a text file (the owner's draft) and lists every number and every phrase banned by `claims-and-evidence.md` that does not match the facts file. It rewrites nothing.

### REQ-8 The owner's checklist and the video kit are current
Found (outside this repo, so Kiro edits them only on the owner's word): the Desktop checklist still gives `parityproven.netlify.app` as the app link, its shot list says "0 verified" and differs from the beat sheet in the planning repo's `video/VIDEO-KIT.md`, and prompt G10 does not mention MCP or workflows. The stills in `video/screenshots/` show 0 verified. Every page carries a "Powered by Netlify" badge, a third-party mark the video rules exclude.
1. One shot list. The checklist points to it and repeats nothing.
2. Stills and cards are rendered again from the submitted commit, with the badge absent, after the code freeze (design.md).
3. A dry run of every command in the shot list at the submitted commit, with outputs and timings recorded for the owner.

### REQ-9 Disclosures match who did what
Found: README's disclosure covers Claude Code drafting and editing steering through 2026-11-06. Since then Claude Code has written the request briefs Kiro implemented, verified results read-only, and drafted this spec.
1. README's disclosure section states that, with dates, in the owner's words or with his approval. It names this spec.
2. The Kiro write-up facts (REQ-7) list the same, so the write-up cannot claim less.

### REQ-10 Owner-only items are tracked to the submit button
These cannot be done by Kiro. The spec tracks them so nothing is found missing on Dec 4.
1. Devpost: registration confirmed, a draft saved early, description fields, category Resurrection, Best Startup fields (founder confirmation, LinkedIn, website), video URL, repo URL, app URL, write-up, optional social post URL. Submitted, not saved as a draft.
2. Decisions the owner still owes: Best Startup while the About page says ParityProven is not yet formed as a company (the sponsor decides eligibility at its discretion); whether AI-generated narration or text from the Gemini source pack is used anywhere, given N1A and that Social Blitz posts are judged on "original thoughts vs AI writing".
3. The site and the public repo stay up, free and without login, until 2027-01-29 1:00 pm PT.
4. After submission, the repo's default branch is not changed in a way that makes the submitted description untrue.

### REQ-11 A closeout custom agent, and the workflow definitions saved (owner decisions D5b-B 2026-11-23 and D5c-A 2026-11-23; design from `kiro-request-closeout-agent.md`)
Found: no custom agent exists (D5-N). The three workflow runs used only Kiro's built-in agents, and their definitions existed only on the owner's PC.
**Part A: the workflow definitions are saved.**
1. `.agents/workflows/<run>.json` holds the three `workflow-definition.json` files, byte for byte. Never the state files (they carry the owner's chat text). `.agents/README.md` lists all three runs, including the goal run, with what each did, the models set, the commits that hold its work and the files' SHA-256. A content check precedes the copy; a repo test fails if chat text, a user path, an e-mail address or a secret ever appears there. The facts file's workflows row cites `.agents/workflows/`.
**Part B: one custom agent that does real closeout work.**
2. `.kiro/agents/closeout-auditor.md`: a read-only checker for phases 4 and 5. At a named commit it runs `npm test` (which includes the facts staleness test), `npm run check:review-interval`, `npm run predeploy:check`, `npm run site:check` and `npm run site:widths`, and reports each result. On a draft the owner names it runs `npm run fact-check -- <file>` and lists what claims more than `claims-and-evidence.md` allows. It reports and never rewrites the owner's words, and never says pass or fail for an object (the verdict stays code: `src/pairs/status.ts`). It writes one dated report to `evidence/closeout/agent-runs/<date>-<commit>.md`, the only write it may make.
3. Limits are structural: it cannot run `npm run approve` or `log-effort --review`, cannot edit `src/`, `pairs/`, `conversions/`, `receipts/`, `web/` or the steering files, and never commits or pushes. The agent file says which mechanism enforces each one: the `tools` list, `excludedTools`, and `permissions.rules` (deny overrides allow, so the report folder is excluded from the deny on writes, not allowed beside it). Steering files are loaded as `resources`. `npm run facts` is not allowed to it, because it writes a file; the staleness test in `npm test` covers it.
4. A negative test, seen failing first: asked to run `npm run approve` and to edit one file under `pairs/`, the agent is refused by the mechanism and not by declining; the output is saved under `evidence/closeout/`. The same run shows it can still run `npm test` and write its report. A repo test also reads the agent file and fails if it gains an unrestricted write, allows `approve` or push, or loses a deny rule.
5. One report from a real invocation (a workflow step naming the agent, or a direct chat), made against a real commit, is saved in `evidence/closeout/agent-runs/`. Until it exists, nothing says a custom agent was used. If this Kiro session cannot launch the agent, the owner selects it once in the IDE and the transcript is kept.
6. D5 is recorded as a dated ruling in `kiroween-submission.md` only after items 2 to 5: "custom agent: `.kiro/agents/<name>.md`, used <date> for <task>"; the facts file's custom-agent row cites the file and the report. The write-up says it was added late, on 2026-11-2x, and used for the final QA pass.
7. Cut date **2026-11-26** (D5c-A). If it is not built, seen failing, and run by then, Part B is dropped, D5 stays "none", and the write-up says custom agents were not used. Part A goes ahead either way (done 2026-11-23).
Syntax confirmed 2026-11-23 from kiro.dev: an agent's `permissions.rules` take a capability (`fs_read`, `fs_write`, `shell`), glob patterns, an optional `exclude`, and an effect (`deny`, `ask`, `allow`); deny overrides allow; shell commands are split on `;`, `&&`, `||` and `|` and each part checked; `tools` and `permissions` are separate fields; Markdown agent files take their config in front matter and their prompt in the body.