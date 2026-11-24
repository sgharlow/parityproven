---
inclusion: manual
---

# Kiroween 2026 submission checklist

Source: the official rules at https://kiroween.devpost.com/rules and the overview page, re-read 2026-11-20 (the rules page says "Updated November 16, 2026, to include residents of Australia"). The deadline is **Dec 4, 2026, 2:00 pm PT**, with no extensions. Judging Period: Dec 16, 2026 1:00 pm PT – Jan 29, 2027 1:00 pm PT. Judges may score from the text, images and video alone, without testing the app.

## Eligibility and conduct (rules §3, Submission Requirements)
- [x] The project was built during the submission period (from Oct 30, 2026), and all pre-existing code is disclosed. — first commit 2026-11-03; the v2.1 business plan was written after Oct 30 (owner, 2026-11-12); Claude-drafted steering is disclosed in the README, and so is Claude Code's later part (ruling D6a-2, owner 2026-11-23: it wrote the briefs Kiro implemented and drafted the closeout spec, and wrote no product code); third-party code and data are listed in `THIRD-PARTY-NOTICES.md` and `sources/manifest.json`.
- [x] The entrant is not an employee or agent of the Sponsor (AWS), Devpost, or an affiliate of either (rules §3). — confirmed by the owner 2026-11-12.
- [x] The entrant is of age and not resident in an excluded country or region (rules §3). — confirmed true by the owner 2026-11-20.
- [x] No "financial or preferential support from the Sponsor or Administrator" (funding, investment, a contract or a commercial licence before the end of the submission period); the hackathon Kiro credits offered to all registered participants are the only support. — confirmed true by the owner 2026-11-20. The Kiro credits were redeemed by the owner (2026-11-20).
- [x] Third-party SDKs, APIs and data used under their terms. — every input pinned with its licence in `sources/manifest.json`.

## Repository
- [x] A public **GitHub** repo with an open-source license visible in its About section (Apache-2.0). — public since 2026-11-13 after a full-history gitleaks scan (no leaks) and npm audit (0 vulnerabilities); GitHub API reports `Apache-2.0`; topics set; homepage set to the live URL.
- [x] `/.kiro` at the repo root with specs, hooks and steering, and **not** listed in `.gitignore`. — steering, specs and hooks are tracked (counts: `npm run facts` once it exists); `git check-ignore` found none ignored (2026-11-13). The website publishes only `web/` and `receipts/` (`_site/`, built by `scripts/build-site.mjs`), so `.kiro/` is in the repo but not on the website.
- [ ] All source code, assets and instructions needed to run it. — README "Run it". Open because: the full Docker re-run from an anonymous clone of the submitted commit has no recorded result. A run of commit 4396287 started 2026-11-19 and stopped after 7 of 46 conversions (the Docker daemon was not running); it is not a result. The box is ticked only when `evidence/fresh-clone/<date>-<commit>.txt` exists (submission-closeout REQ-1).

## Working app
- [x] A working app with a public URL, testable free of charge until the Judging Period ends (Jan 29, 2027). — live at https://parityproven.com (also parityproven.netlify.app; first deployed 2026-11-13 after `npm run predeploy:check` passed; `.env`, `.git`, `.kiro`, `.claude` return 404; home, receipt, questionnaire and about pages return 200). Keep the Netlify site up and the repo public through Jan 29, 2027. No login needed.
- [x] `parityproven.com` resolves to the site. — attached on Netlify 2026-11-13; Cloudflare DNS records are the owner's (DNS only, not proxied). Checked 2026-11-16: `parityproven.com` and `www.parityproven.com` return 200 with the site's page.

## Devpost form (the owner's words, N1A)
- [ ] A text description of features and functionality.
- [ ] A demo video under 3 minutes, public on YouTube, showing the app running on the device it was built for, with no third-party trademarks or copyrighted music. — shot list dry-run 2026-11-13.
- [ ] A write-up on how Kiro was used. The rules ask about: Kiro IDE/CLI/Web/Crew, custom agents, agent hooks, spec-driven development, steering, MCP, property-based testing, Kiro powers. Used: Kiro IDE, specs, steering, hooks (both observed firing; a conversion save re-runs its check), PBT, MCP (a project-built read-only server over the WideWorldImporters sample, registered in `.kiro/settings/mcp.json`; Kiro's first call, `list_suppliers`, logged 2026-11-19T00:14:45Z with client "kiro" in `evidence/mcp/tool-calls.jsonl`). Also used: Kiro workflows with sub-agents (three runs, all with Kiro's built-in agents: workflow creator, planner, coder and semantic reviewer; table in `.agents/tasks/adversarial-review/README.md`; the first run, 2026-11-18, finished the remaining spec work for step two, the other two built and ran the adversarial review gate and fixed eight objects after it) built and ran the adversarial review gate, with a Claude attacker and a GPT auditor (`.kiro/specs/adversarial-review/`). Not used: powers, Kiro CLI, Kiro Crew. Custom agents: none (owner confirmed 2026-11-23, ruling D5-N; no `.kiro/agents` in the repo and none in `~/.kiro`). Facts sheet: `writeup-facts-2026-11-12.md` in the planning repo.
- [ ] Category: **Resurrection**. — chosen (R2); select it on the form.
- [ ] Best Startup bonus: founder confirmation, LinkedIn profile, startup website.
- [ ] Optional: a social post starting with `#KiroweenHackathon26` (Social Blitz), published during the submission period, that shares the entrant's favorite thing about Kiro and how it changed the way they approached development, with the link entered in the form (judged on original thoughts versus AI writing, insights about Kiro, and the post's assets); a blog post that says it is written for Kiroween 2026 (not planned, R21).
- [ ] Submitted (not just saved as a draft) before the deadline.

Judging: Potential Impact, Technological Implementation (Kiro use), Design, Innovation/Idea and Presentation, at 20% (10 points) each.
