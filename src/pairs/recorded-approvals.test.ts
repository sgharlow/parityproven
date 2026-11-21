import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import type { PairRecord } from "../pairs/schema.js";
import { conversionChangeDate, firstCommitDate, firstPassDate, oneDayProblem } from "../pairs/review-rules.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Ruling D1: every approval recorded on an adversarial report is at least a day after its first pass. */
describe("recorded step 5 approvals", () => {
  it("fall at least one day after the latest of the record's first commit, the conversion's last change and the gate run", () => {
    const tooSoon: string[] = [];
    let checked = 0;
    for (const db of readdirSync(join(ROOT, "pairs"))) {
      for (const f of readdirSync(join(ROOT, "pairs", db)).filter((x) => x.endsWith(".json"))) {
        const rec = JSON.parse(readFileSync(join(ROOT, "pairs", db, f), "utf-8")) as PairRecord;
        if (rec.evidence.step5Method !== "adversarial-report") continue;
        checked++;
        const object = f.replace(/\.json$/, "");
        const conv = existsSync(join(ROOT, "conversions", db, `${object}.sql`)) ? conversionChangeDate(ROOT, db, object) : null;
        const first = firstPassDate({ pairFirstCommit: firstCommitDate(ROOT, join(ROOT, "pairs", db, f)), conversionChanged: conv, gateRunAt: rec.evidence.adversarial?.runAt });
        const problem = oneDayProblem(first, rec.evidence.reviewDate ?? "");
        if (problem) tooSoon.push(`${db}/${object}: ${problem}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(tooSoon).toEqual([]);
  }, 60000);
});
