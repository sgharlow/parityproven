---
inclusion: manual
---

# Kiroween 2026 submission checklist

Source: the official rules at https://kiroween.devpost.com/rules. The deadline is **Dec 4, 2026, 2:00 pm PT**, with no extensions.

- [x] The project was built during the submission period (from Oct 30, 2026), and all pre-existing code is disclosed. — first commit 2026-11-03; the v2.1 business plan was written after Oct 30 (owner, 2026-11-12); Claude-drafted steering is disclosed in the README.
- [ ] No "financial or preferential support from the Sponsor" (AWS) beyond what the rules themselves offer, such as hackathon credits.
- [x] The entrant is not an employee or agent of the Sponsor (AWS), Devpost, or an affiliate of either (rules §3). — confirmed by the owner 2026-11-12.
- [ ] A working app with a public URL, testable free of charge until Jan 29, 2027. — Netlify config is publish-only; deploy after the flip; run `npm run predeploy:check` first.
- [ ] A text description of features and functionality.
- [ ] A demo video under 3 minutes on YouTube (public), showing the app running, with no third-party music or trademarks.
- [ ] A public **GitHub** repo with an open-source license visible in its About section (Apache-2.0). — licence detected and topics set; still private; set the homepage to the live URL after the deploy.
- [x] `/.kiro` at the repo root with specs, hooks and steering, and **not** listed in `.gitignore`.
- [ ] Category: **Resurrection**. — chosen (R2); select it on the Devpost form.
- [ ] Best Startup bonus: founder confirmation, LinkedIn profile, startup website.
- [ ] A write-up on how Kiro was used: specs, hooks, steering, MCP, property-based testing, and the Kiro surfaces used. — facts sheet in the planning repo (`writeup-facts-2026-11-12.md`); MCP was not used (R18).
- [ ] Optional: a blog post mentioning Kiroween 2026; a social post starting with `#KiroweenHackathon26`.

Judging: Potential Impact, Technological Implementation (Kiro use), Design, Innovation and Presentation, at 20% each.
