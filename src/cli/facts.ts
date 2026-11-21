/**
 * npm run facts: writes evidence/facts/submission-facts.md from the committed records, .kiro/ and git (submission-closeout REQ-7).
 *   node dist/cli/facts.js [--no-tests]      (--no-tests skips the vitest run; the test count is then "not measured")
 * It writes figures, paths and the commands that derive them. It writes no sentences meant for pasting.
 */
import { execFileSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { computeRecordFacts, FACTS_JSON_END, FACTS_JSON_START } from "../facts/compute.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const git = (...a: string[]): string => execFileSync("git", a, { cwd: ROOT, encoding: "utf-8", maxBuffer: 1 << 26 }).trim();

function testCount(): string {
  if (process.argv.includes("--no-tests")) return "not measured (run without --no-tests)";
  const out = join(mkdtempSync(join(tmpdir(), "pp-facts-")), "vitest.json");
  spawnSync("npx", ["vitest", "run", "--reporter=json", `--outputFile=${out}`], { cwd: ROOT, shell: true, encoding: "utf-8", maxBuffer: 1 << 28 });
  if (!existsSync(out)) return "not measured (vitest wrote no result file)";
  const j = JSON.parse(readFileSync(out, "utf-8"));
  return `${j.numPassedTests} passed of ${j.numTotalTests} in ${j.testResults.length} files`;
}

function disclosures(): string {
  const readme = readFileSync(join(ROOT, "README.md"), "utf-8");
  const m = readme.match(/^## Pre-existing work and disclosures\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  return m ? m[1]!.trim() : "(README has no disclosures section)";
}

function main(): void {
  const f = computeRecordFacts(ROOT);
  const head = git("rev-parse", "--short", "HEAD");
  const tracked = (p: string): string => (git("ls-files", "--", p) ? "yes" : "no");
  const rows: Array<[string, string, string]> = [
    ["Programmable objects inventoried", String(f.receipts.inventory), "`receipts/index.json` summary.inventory"],
    ["Receipts on the scorecard", String(f.receipts.total), "`receipts/index.json` summary.total"],
    ["Verified / pending / failed", `${f.receipts.verified} / ${f.receipts.pending} / ${f.receipts.failed}`, "`receipts/index.json` summary"],
    ["Excluded as out of scope / not attempted", `${f.receipts.excluded} / ${f.receipts.notAttempted}`, "`receipts/index.json` summary"],
    ["Objects converted and run through the harness", String(f.converted), "`pairs/*/*.json` with evidence.step1 not \"not-run\""],
    ["Rows compared across recorded runs", f.rowsCompared.toLocaleString("en-US"), "sum of `evidence.rowsCompared` over `pairs/`"],
    ["Planted defects caught by the harness", String(f.plantedDefectsCaught), "sum of `evidence.mutantsDetected.length` over `pairs/`"],
    ["First drafts recorded / failed the check on their first run", `${f.firstDrafts.recorded} / ${f.firstDrafts.failedOnFirstRun}`, "`evidence.engineOutputCheck` (step3) in `pairs/`"],
    ["Step 2 passes", String(f.steps.step2Pass), "`evidence.step2` in `pairs/`"],
    ["Step 3 passes", String(f.steps.step3Pass), "`evidence.step3` in `pairs/`"],
    ["Step 4: pass / not applicable / fail", `${f.steps.step4.pass} / ${f.steps.step4.na} / ${f.steps.step4.fail}`, "`evidence.step4` in `pairs/`"],
    ["Step 5 recorded", String(f.steps.step5Recorded), "`evidence.step5` in `pairs/`"],
    ["Step 5 recorded by (name, date)", f.steps.step5Reviewers.join("; ") || "none", "`evidence.reviewer`, `evidence.reviewDate`"],
    ["Step 5 method", f.steps.step5Methods.join("; ") || "none", "`evidence.step5Method`"],
    ["Step 4 factors other than the default", f.agreedRuntimeFactors.join(", ") || "none", "`evidence.runtime.threshold` in `pairs/`"],
    ["Human minutes logged (total / records with minutes)", `${f.humanMinutes.total} / ${f.humanMinutes.recordsWithMinutes}`, "`effort.humanMinutes` in `pairs/`"],
    ["Adversarial: objects gated / gate pass", `${f.adversarial.objectsGated} / ${f.adversarial.gatePass}`, "`evidence/adversarial/<db>/*.json` gate.passed"],
    ["Adversarial: cases ran / differed", `${f.adversarial.casesRan} / ${f.adversarial.casesDiffered}`, "`evidence/adversarial/<db>/*.json` summary"],
    ["Adversarial: regression cases kept", String(f.adversarial.regressionCases), "`adversarial/<db>/*.cases.json` regression: true"],
    ["Adversarial: models recorded", f.adversarial.models.join(" | "), "attacker and auditor stamps in the evidence files"],
    ["Specs / steering files / hooks", `${f.kiro.specs.length} / ${f.kiro.steering.length} / ${f.kiro.hooks.length}`, "`ls .kiro/specs .kiro/steering .kiro/hooks`"],
    ["MCP tool calls logged / clients", `${f.mcp.toolCalls} / ${f.mcp.clients.join(", ")}`, "`evidence/mcp/tool-calls.jsonl`"],
    ["Commits / first commit", `${git("rev-list", "--count", "HEAD")} / ${git("log", "--reverse", "--format=%cs").split("\n")[0]}`, "`git rev-list --count HEAD`; `git log --reverse`"],
    ["Unit tests", testCount(), "`npx vitest run`"],
  ];
  const constants: Array<[string, string, string]> = [
    ["Verification steps", "6", "`.kiro/steering/verification-standard.md`"],
    ["Default step 4 factor", "1.5x", "`src/harness/generic/bench.ts` RUNTIME_FACTOR"],
    ["Submission deadline", "2026-12-04 2:00 pm PT", "`.kiro/steering/kiroween-submission.md`"],
    ["Video limit", "3 minutes", "`.kiro/steering/kiroween-submission.md`"],
    ["Judging criteria and weight", "5 criteria, 20% each", "`.kiro/steering/kiroween-submission.md`"],
    ["Site and repo stay up until", "2027-01-29", "`.kiro/steering/kiroween-submission.md`"],
  ];
  const table = (r: Array<[string, string, string]>, h: [string, string, string]): string =>
    [`| ${h.join(" | ")} |`, `|---|---|---|`, ...r.map((x) => `| ${x.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`)].join("\n");
  const featureRows = f.features.map((x) => `| ${x.feature} | ${x.used ? "artifact present" : "no artifact in the repo"} | ${x.artifacts.join(", ") || "none"} | ${x.artifacts.map((a) => `${a}: ${tracked(a)}`).join("; ") || "n/a"} |`);

  const md = [
    "# Submission facts (generated by `npm run facts`; do not edit)",
    `Measured at commit \`${head}\` on ${new Date().toISOString().slice(0, 10)} from the committed files and git. Figures and paths only: every word of the submission is the owner's. \`npm test\` fails when the figures between the JSON markers below no longer match the records; \`npm run fact-check -- <draft>\` checks a draft against this file.`,
    "",
    "## Figures",
    table(rows, ["Figure", "Value", "How to re-derive"]),
    "",
    "## Constants",
    table(constants, ["Item", "Value", "Source"]),
    "",
    "## Kiro features the rules ask about",
    "A row says \"artifact present\" only when the path exists. \"No artifact in the repo\" means this file cannot show use; it does not say the feature was not used.",
    "",
    "| Feature | Evidence | Path | Tracked in git |",
    "|---|---|---|---|",
    ...featureRows,
    "",
    "## Who did what (copied from the README section \"Pre-existing work and disclosures\")",
    disclosures(),
    "",
    FACTS_JSON_START,
    JSON.stringify(f, null, 2),
    FACTS_JSON_END,
    "",
  ].join("\n");
  const out = join(ROOT, "evidence", "facts", "submission-facts.md");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, md);
  console.log(`wrote ${out} (commit ${head})`);
}
main();
