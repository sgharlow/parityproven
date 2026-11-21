/**
 * CLI (ruling A1): the owner's approval of a batch report, which records verification step 5.
 *
 *   npm run approve -- --report evidence/adversarial/reports/batch-1.md --reviewer "<name>" --date <yyyy-mm-dd>
 *
 * Runs only at an interactive terminal and asks for the reviewer name to be retyped, so an agent or workflow step cannot run it.
 * Each object's gate is re-evaluated from its evidence JSON, not from the report text. All or nothing: one refused object stops the batch.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline/promises";
import type { PairRecord } from "../pairs/schema.js";
import type { AdversarialEvidence } from "../adversarial/schema.js";
import { computeStatus } from "../pairs/status.js";
import { conversionChangeDate, firstCommitDate } from "../pairs/review-rules.js";
import { decideApproval, evidenceFileSha256, reportObjects, ownerConfirmItems, reviewerConfirmed, ttyProblem } from "./approve-decision.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(n);
  return i === -1 ? undefined : process.argv[i + 1];
};

async function main(): Promise<void> {
  const tty = ttyProblem(process.stdin.isTTY, process.stdout.isTTY);
  if (tty) throw new Error(tty);
  const report = arg("--report");
  const reviewer = arg("--reviewer");
  const date = arg("--date");
  if (!report || !reviewer || !date) throw new Error('Usage: approve --report <path> --reviewer "<name>" --date <yyyy-mm-dd>');
  const reportPath = resolve(ROOT, report);
  if (!existsSync(reportPath)) throw new Error(`report not found: ${report}`);
  const objects = reportObjects(readFileSync(reportPath, "utf-8"));
  if (!objects.length) throw new Error("no objects found in the report");

  const planned = objects.map(({ database, object }) => {
    const pairPath = resolve(ROOT, "pairs", database, `${object}.json`);
    if (!existsSync(pairPath)) throw new Error(`no pair record for ${database} ${object}`);
    const pair = JSON.parse(readFileSync(pairPath, "utf-8")) as PairRecord;
    const evPath = resolve(ROOT, "evidence", "adversarial", database, `${object}.json`);
    const evidence = existsSync(evPath) ? (JSON.parse(readFileSync(evPath, "utf-8")) as AdversarialEvidence) : null;
    const decision = decideApproval({ name: `${database} ${object}`, evidence, pair, firstCommit: firstCommitDate(ROOT, pairPath), conversionChanged: conversionChangeDate(ROOT, database, object), date });
    return { pairPath, pair, decision };
  });

  const refused = planned.filter((p) => !p.decision.ok);
  if (refused.length) {
    for (const p of refused) console.error(`REFUSED ${p.decision.name}:\n${p.decision.reasons.map((r) => `  - ${r}`).join("\n")}`);
    throw new Error(`${refused.length} of ${planned.length} objects refused; nothing was written`);
  }

  // agent-written entries that let the gate pass are shown here; retyping the name confirms them.
  // The evidence file's hash is recorded, so an edit after approval (e.g. to an objection's confirmedBy) makes it stale.
  const confirmed = new Map<string, { sha: string; items: string[] }>();
  for (const { database, object } of objects) {
    const evPath = resolve(ROOT, "evidence", "adversarial", database, `${object}.json`);
    const text = readFileSync(evPath, "utf-8");
    const items = ownerConfirmItems(JSON.parse(text) as AdversarialEvidence);
    confirmed.set(`${database} ${object}`, { sha: evidenceFileSha256(text), items });
    if (items.length) console.log(`\n${database} ${object}: agent-written entries you confirm by approving:\n${items.map((x) => `  - ${x}`).join("\n")}`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const retyped = await rl.question(`\nApproving ${planned.length} objects on ${report}, including the entries listed above. Retype the reviewer name to confirm: `);
  rl.close();
  if (!reviewerConfirmed(reviewer, retyped)) throw new Error("reviewer name did not match; nothing was written");

  for (const p of planned) {
    const e = p.pair.evidence;
    const before = p.pair.status;
    e.step5 = "pass";
    e.reviewer = reviewer;
    e.reviewDate = date;
    e.step5Method = "adversarial-report";
    e.step5Report = report.replace(/\\/g, "/");
    const c = confirmed.get(p.decision.name)!;
    e.step5EvidenceSha256 = c.sha;
    e.step5Confirmed = c.items;
    if (e.step6 === "not-run" && typeof p.pair.origin === "object") e.step6 = "n/a";
    p.pair.status = computeStatus(e);
    writeFileSync(p.pairPath, JSON.stringify(p.pair, null, 2) + "\n", "utf-8");
    console.log(`${p.decision.name}: step 5 pass by ${reviewer} on ${date}; status ${before} -> ${p.pair.status}`);
  }
}

main().catch((err) => { console.error((err as Error).message); process.exit(1); });
