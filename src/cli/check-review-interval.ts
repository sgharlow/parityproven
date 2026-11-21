/**
 * npm run check:review-interval: for every pair record approved on an adversarial report, shows the three dates that start the
 * one-day clock (ruling D1) and the review date, and exits 1 when a review is not at least one day later. Reads git; rewrites nothing.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import type { PairRecord } from "../pairs/schema.js";
import { conversionChangeDate, firstCommitDate, firstPassDate, oneDayProblem } from "../pairs/review-rules.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
let bad = 0, checked = 0;
for (const db of readdirSync(join(ROOT, "pairs"))) {
  for (const f of readdirSync(join(ROOT, "pairs", db)).filter((x) => x.endsWith(".json"))) {
    const rec = JSON.parse(readFileSync(join(ROOT, "pairs", db, f), "utf-8")) as PairRecord;
    if (rec.evidence.step5Method !== "adversarial-report") continue;
    checked++;
    const object = f.replace(/\.json$/, "");
    const pairFirst = firstCommitDate(ROOT, join(ROOT, "pairs", db, f));
    const conv = existsSync(join(ROOT, "conversions", db, `${object}.sql`)) ? conversionChangeDate(ROOT, db, object) : null;
    const gate = rec.evidence.adversarial?.runAt ?? null;
    const first = firstPassDate({ pairFirstCommit: pairFirst, conversionChanged: conv, gateRunAt: gate });
    const problem = oneDayProblem(first, rec.evidence.reviewDate ?? "");
    if (problem) {
      bad++;
      console.log(`TOO SOON ${db}/${object}: record first commit ${pairFirst}, conversion last changed ${conv}, gate run ${gate?.slice(0, 10)}, review ${rec.evidence.reviewDate}`);
    }
  }
}
console.log(`approved on a report: ${checked}; review not a day after the first pass: ${bad}`);
process.exit(bad ? 1 : 0);
