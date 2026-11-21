# submission-closeout tasks
Requirements: `requirements.md`. Design: `design.md`. Tasks marked **(owner)** are never done by an agent. Tick a box only with the commit or evidence file beside it. An open box carries an "open because" note on its own line (`src/specs/tasks.test.ts` fails otherwise).
Status 2026-11-20: phase 0 done; phase 2 done except the items that wait on owner decisions D1-D6; phase 3 site work in progress; phase 4 starts at the code freeze (design.md).

## Phase 0: check this spec
- [x] 0.1 Re-measure the "Found" lines in `requirements.md` against the repo; correct any that are wrong and say which (REQ header) (2026-11-20: all hold; additions and one precision in `requirements.md` "Phase 0 re-measurement"; output `evidence/closeout/0.1-found-lines.txt`)
- [ ] 0.2 Add this spec to the README disclosure once D6 is answered (REQ-9.1) (open because: D6 is unanswered)

## Phase 1: owner decisions
- [ ] 1.1 **(owner)** D1 one-day rule · D2 `.agents/` · D3 batch minutes · D4 wording · D5 custom agents · D6 disclosure sentence (design.md table), asked one at a time (open because: owner has not answered; asked 2026-11-20)
- [ ] 1.2 Record each answer as a dated ruling in the steering file it changes (open because: needs the answers in 1.1)

## Phase 2: evidence and truth
- [x] 2.1 `adversarial-review/tasks.md` items 4-10 and the open `conversion-loop` box: verified against the repo and ticked with their commits (2026-11-20: items 4-10 ticked in `adversarial-review/tasks.md` with 6f760f5, a0132a8, 356c9bb, 3c75bfe, 1aadcac, 7af4c52, 8acdeb5, b94074d, 8f39b14, c31c8c1, e4824dc, b78c56a, 4396287; the `conversion-loop` box is closed with its measured counts, and notes that the interval rule for 14 objects is open under D1)
- [x] 2.2 Test: an open box without an "open because" note fails `npm test`; seen failing first (`src/specs/tasks.test.ts`; failing run `evidence/closeout/2.2-tasks-test-seen-failing.txt`: 36 open boxes without a note)
- [ ] 2.3 Apply D2: commit `.agents/tasks/adversarial-review/` after the content check, or gitignore `.agents/` (REQ-3.1) (open because: D2 is unanswered)
- [x] 2.4 One observed run of each hook committed under `evidence/hooks/` (`evidence/hooks/observed-runs-2026-11-20.txt`, `evidence/hooks/validate-pair-planted-defect.txt`; both hooks fired on saves in this workspace, and the convert run rewrote the pair record; the touched files were restored)
- [ ] 2.5 Apply D1. If A: tests seen failing on the 14 objects, guard changed, ruling in `verification-standard.md` (REQ-4.1) (open because: D1 is unanswered)
- [ ] 2.6 **(owner)** If D1 = A: `npm run approve` for the affected batch reports on a later date (open because: depends on D1 and on 2.5)
- [ ] 2.7 Receipts show conversion-changed date, gate run time and review date; batch review time per D3 (REQ-4.2, 4.4) (open because: the three dates are built and tested (`conversionLastChanged` in `src/receipts/`, `web/app.js`; rebuilt receipts in this phase) but the batch review time needs D3; until then a verified receipt says "review time not recorded")
- [ ] 2.8 Apply D4 wording for step 5 on scorecard, About and README; `predeploy:check` passes (REQ-4.3) (open because: D4 is unanswered; the README and About still say "second human review")
- [x] 2.9 `tech.md`, `structure.md`, `kiroween-submission.md`, README corrected line by line from the REQ-5 list (REQ-5.1) (2026-11-20; the README's old fresh-clone line is replaced by a pointer to `evidence/fresh-clone/`, which is filled in by 4.2; the "All source code ... run it" box in `kiroween-submission.md` was unticked until that file exists)
- [x] 2.10 Stale-doc test extended to hand-typed counts and hashes in README and steering; seen failing first (`src/receipts/hand-typed.test.ts`; failing run `evidence/closeout/2.10-hand-typed-seen-failing.txt`: a9ce6fc and three counts)
- [x] 2.11 Repo homepage set to `https://parityproven.com`; checked with `gh api` (`evidence/closeout/2.11-homepage.txt`)
- [ ] 2.12 README disclosure updated with D6 (REQ-9.1) (open because: D6 is unanswered)
- [ ] 2.13 Receipts and README block rebuilt, tests, `predeploy:check`, push, `site:check` PASS (open because: repeated after each decision-dependent item; the last rebuild is after 2.5-2.8)

## Phase 3: site and facts
- [ ] 3.1 Scorecard table no longer widens the page; checked at 1280, 1024, 768 and 390 px with output in `evidence/site-check/` (REQ-6.1) (open because: the fix is written; the live check runs after the push; failing run before the fix: `evidence/site-check/2026-11-20-widths-before-fix.txt`)
- [ ] 3.2 Favicon, meta description, Open Graph tags on every page; `site:check` requires them; seen failing first (REQ-6.2) (open because: the fix is written; the live check runs after the push; failing run before the fix: `evidence/site-check/2026-11-20-head-tags-before-fix.txt`)
- [ ] 3.3 Intro block above the table with D4's words; disclosure notes moved below the counts, unchanged in content (REQ-6.3) (open because: D4 is unanswered)
- [ ] 3.4 `npm run facts` and the staleness test (REQ-7.1-7.3); includes the per-feature Kiro table (REQ-3.3) and who-did-what (REQ-9.2) (open because: not started; the per-feature table needs D5 and the who-did-what part needs D6)
- [ ] 3.5 `npm run fact-check -- <file>`; negative control: a draft with one wrong number and one banned phrase is reported (REQ-7.4) (open because: not started; it reads the file that 3.4 writes)
- [ ] 3.6 Push, `site:check` PASS, phase recorded in the planning repo's resume file on the owner's word (open because: after 3.1-3.5)

## Phase 4: freeze and final evidence
- [ ] 4.1 Code freeze commit named in `kiroween-submission.md` (open because: freeze is proposed for 2026-11-27, after phase 3)
- [ ] 4.2 Fresh-clone run at the freeze commit; result in `evidence/fresh-clone/`; README line and checklist box updated only then (REQ-1) (open because: runs at the freeze commit; the 2026-11-19 run stopped after 7 of 46 conversions because Docker was not running and is not a result)
- [ ] 4.3 One shot list; Desktop checklist points to it (owner's word needed to edit it) (REQ-8.1) (open because: after the freeze; editing the Desktop file needs the owner's word)
- [ ] 4.4 Stills and cards rendered from the freeze commit, badge absent (REQ-8.2) (open because: after the freeze; the cards were re-rendered from the repo on 2026-11-20 and the stills are stale)
- [ ] 4.5 Dry run of every shot-list command at the freeze commit, outputs and timings recorded (REQ-8.3) (open because: after the freeze and 4.3)
- [ ] 4.6 `npm run facts` at the freeze commit; file handed to the owner (open because: after 3.4 and the freeze)

## Owner: the submission (REQ-10)
- [ ] 5.1 **(owner)** Devpost registration confirmed and a draft saved (open because: owner task)
- [ ] 5.2 **(owner)** Decide: Best Startup entry; any AI-generated narration or text (open because: owner task)
- [ ] 5.3 **(owner)** Description fields written; `npm run fact-check` run on the text (open because: owner task; needs 3.5)
- [ ] 5.4 **(owner)** Kiro write-up written from the facts file; fact-checked (open because: owner task; needs 3.4)
- [ ] 5.5 **(owner)** Video recorded, under 3:00, public on YouTube, no third-party marks or music (open because: owner task)
- [ ] 5.6 **(owner)** Optional social post, starting with `#KiroweenHackathon26`, sharing a favourite thing about Kiro and how it changed the approach to development (open because: owner task)
- [ ] 5.7 **(owner)** Form: category Resurrection, bonus fields, URLs; submitted before 2026-12-04 2:00 pm PT (open because: owner task)
- [ ] 5.8 Site and repo stay up through 2027-01-29 (open because: runs until 2027-01-29)
