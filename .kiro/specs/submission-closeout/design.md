# submission-closeout design

## Order and freeze
Work runs in four phases. A later phase starts only when the earlier one is committed and `site:check` passes.

| Phase | What | Proposed date (owner confirms or changes) |
|---|---|---|
| 1 | Owner decisions D1-D6 below, one at a time, as a coded menu | 2026-11-21 |
| 2 | Evidence and truth: REQ-2, 3, 4, 5, 9 | by 2026-11-24 |
| 3 | Site: REQ-6. Facts: REQ-7 | by 2026-11-26 |
| 4 | **Code freeze**, then REQ-1 (fresh clone), REQ-8 (stills, cards, dry run) | freeze 2026-11-27; evidence by 2026-11-28 |
| Owner | Description, write-up, video, form | video by 2026-12-01; submit by 2026-12-02 |

Stop rule: anything in phase 3 not done by 2026-11-26 is cut, except the sideways scroll (REQ-6.1) and the favicon. After the freeze only a defect that makes a submitted claim untrue is fixed, and a fix repeats REQ-1.

## Owner decisions (phase 1)
| Id | Question | Options |
|---|---|---|
| D1 | "First pass" for the one-day rule when a conversion changes | A: date the reviewed conversion last changed; approve the 14 again on a later date. B: keep "first commit of the pair record", say so in the standard and on the receipt |
| D2 | `.agents/tasks/adversarial-review/` | A: commit after the check in REQ-3.1. B: gitignore |
| D3 | Minutes spent on each of the four batch reports | four numbers, or "not recorded" |
| D4 | Step 5 wording (scorecard, About, README) and the three lines above the scorecard | owner writes, or edits Kiro's proposal |
| D5 | Custom agents: was any custom agent definition written or used | yes with path, or no |
| D6 | Disclosure sentence for Claude Code's part since 2026-11-06 | owner writes, or edits Kiro's proposal |

## What changes where
- `src/pairs/review-rules.ts`: only if D1 = A. `firstPassDate` becomes the later of the pair record's first commit and the last commit that changed the final conversion's sha256. Tests first, seen failing on the 14 objects, then the change. Re-approval is the owner's `npm run approve`; no agent runs it.
- `src/receipts/`: three dates on the receipt (REQ-4.2); batch review time (REQ-4.4). The PairRecord schema stays in `src/pairs/schema.ts`; new fields are optional so existing records validate unchanged.
- `src/cli/facts.ts` + `npm run facts`, `src/cli/fact-check.ts` + `npm run fact-check`. `.tmp/facts.mjs` is the starting point; the committed version reads only committed files and `git`.
- `src/receipts/readme-status.test.ts` (or the file that holds the stale-README test today): extended for REQ-5.2. New `src/specs/tasks.test.ts` for REQ-2.2.
- `scripts/check-site.mjs`: favicon 200, meta tags present, and a width check. The width check needs a browser; if adding one is not acceptable as a dev dependency, the check is a documented manual step with its output kept in `evidence/site-check/`, and that is said plainly.
- `web/`: `styles` for the table (wrap or scroll inside its own container, never the page), `<head>` tags in every page, favicon file, intro block. `scripts/build-site.mjs` copies the new files; `_site/` still holds only `web/` and `receipts/`.
- `.kiro/steering/tech.md`, `structure.md`, `kiroween-submission.md`, `README.md`: text only.
- `evidence/fresh-clone/`, `evidence/hooks/`, `evidence/facts/`: new folders, written by the commands that produce them.

## Rules that apply to every task
- One harness process at a time. Never rebuild `dist/` while one runs.
- Negative control before trusting any new check: plant the defect (a stale count in README, an open box without a note, a page 20 px too wide, a wrong number in a draft) and see the check fail, then remove it. Keep the failing output in `evidence/`.
- No hand-typed counts. A number in a doc comes from a generated block or is not there.
- Commits: explicit paths, no AI trailers, push `origin main` only, compare local and remote after the push, wait for the Netlify build, run `npm run site:check -- https://parityproven.com`.
- Agents never record step 5, never run `approve`, never write submission prose.
- Files outside this repo (the Desktop checklist, the planning repo) are edited only when the owner says so, and never committed here.

## Risks
- The fresh-clone run takes hours and shares no databases with the live stack; start it the day of the freeze.
- Re-approval under D1 = A changes 14 receipts and the README block two weeks before the deadline. The counts do not change if all 14 are approved again; if one is not, the scorecard shows it as pending, and the facts file follows.
- The intro block and Open Graph text are judged copy. A late wording change needs `predeploy:check` and new stills.
