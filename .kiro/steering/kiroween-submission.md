---
inclusion: manual
---

# Kiroween 2026 submission checklist

Source: the official rules at https://kiroween.devpost.com/rules and the overview page, re-read 2026-11-13. The deadline is **Dec 4, 2026, 2:00 pm PT**, with no extensions. Judging Period: Dec 16, 2026 1:00 pm PT – Jan 29, 2027 1:00 pm PT. Judges may score from the text, images and video alone, without testing the app.

## Eligibility and conduct (rules §3, Submission Requirements)
- [x] The project was built during the submission period (from Oct 30, 2026), and all pre-existing code is disclosed. — first commit 2026-11-03; the v2.1 business plan was written after Oct 30 (owner, 2026-11-12); Claude-drafted steering is disclosed in the README; third-party code and data are listed in `THIRD-PARTY-NOTICES.md` and `sources/manifest.json`.
- [x] The entrant is not an employee or agent of the Sponsor (AWS), Devpost, or an affiliate of either (rules §3). — confirmed by the owner 2026-11-12.
- [ ] The entrant is of age and not resident in an excluded country or region (rules §3). — owner to confirm.
- [ ] No "financial or preferential support from the Sponsor or Administrator" (funding, investment, a contract or a commercial licence before the end of the submission period); the hackathon Kiro credits offered to all registered participants are the only support. — owner to confirm.
- [x] Third-party SDKs, APIs and data used under their terms. — every input pinned with its licence in `sources/manifest.json`.

## Repository
- [x] A public **GitHub** repo with an open-source license visible in its About section (Apache-2.0). — public since 2026-11-13 after a full-history gitleaks scan (no leaks) and npm audit (0 vulnerabilities); GitHub API reports `Apache-2.0`; topics set; homepage set to the live URL.
- [x] `/.kiro` at the repo root with specs, hooks and steering, and **not** listed in `.gitignore`. — 8 steering, 15 spec files (5 specs), 2 hooks tracked; `git check-ignore` finds none ignored (2026-11-13). The website publishes only `web/` and `receipts/` (`_site/`, built by `scripts/build-site.mjs`), so `.kiro/` is in the repo but not on the website.
- [x] All source code, assets and instructions needed to run it. — README "Run it"; anonymous clone at 62bace8 passed `npm ci`, build and 122/122 tests (2026-11-13). Full Docker re-run from a clean clone: repeat after the last code change.

## Working app
- [x] A working app with a public URL, testable free of charge until the Judging Period ends (Jan 29, 2027). — live at https://parityproven.netlify.app (deployed 2026-11-13 after `npm run predeploy:check` passed; `.env`, `.git`, `.kiro`, `.claude` return 404; home, receipt, questionnaire and about pages return 200). Keep the Netlify site up and the repo public through Jan 29, 2027. No login needed.
- [x] `parityproven.com` resolves to the site. — attached on Netlify 2026-11-13; Cloudflare DNS records are the owner's (DNS only, not proxied). Checked 2026-11-16: `parityproven.com` and `www.parityproven.com` return 200 with the site's page.

## Devpost form (the owner's words, N1A)
- [ ] A text description of features and functionality.
- [ ] A demo video under 3 minutes, public on YouTube, showing the app running on the device it was built for, with no third-party trademarks or copyrighted music. — shot list dry-run 2026-11-13.
- [ ] A write-up on how Kiro was used. The rules ask about: Kiro IDE/CLI/Web/Crew, custom agents, agent hooks, spec-driven development, steering, MCP, property-based testing, Kiro powers. Used: Kiro IDE, specs, steering, hooks (both observed firing; a conversion save re-runs its check), PBT, MCP (a project-built read-only server over the WideWorldImporters sample, registered in `.kiro/settings/mcp.json`; Kiro's first call, `list_suppliers`, logged 2026-11-19T00:14:45Z with client "kiro" in `evidence/mcp/tool-calls.jsonl`). Not used: powers, custom agents, Kiro CLI, Kiro Crew. Facts sheet: `writeup-facts-2026-11-12.md` in the planning repo.
- [ ] Category: **Resurrection**. — chosen (R2); select it on the form.
- [ ] Best Startup bonus: founder confirmation, LinkedIn profile, startup website.
- [ ] Optional: a social post starting with `#KiroweenHackathon26` (Social Blitz), published during the submission period; a blog post that says it is written for Kiroween 2026 (not planned, R21).
- [ ] Submitted (not just saved as a draft) before the deadline.

Judging: Potential Impact, Technological Implementation (Kiro use), Design, Innovation/Idea and Presentation, at 20% (10 points) each.
