/**
 * CLI: record human effort and the second review (verification step 5) on a pair record.
 *
 *   npm run log-effort -- --object Integration.GetOrderUpdates --minutes 25
 *   npm run log-effort -- --object Integration.GetOrderUpdates --review "Steve Gharlow" [--date 2026-11-12] [--fail "reason"]
 *
 * --minutes ADDS to effort.humanMinutes (log each session as it happens).
 * --review records step 5. Per the verification standard the review must be at least one day after
 * the first pass; the first pass date is taken from the pair file's first commit in git.
 * After any change, status is recomputed: "verified" only when steps 1-4 pass and step 5 passes
 * (step 6 is "n/a" for public samples), otherwise it stays as it was. This command never writes
 * step 1-4 results; those come only from the harness.
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { execFileSync } from "child_process";
import type { PairRecord } from "../pairs/schema.js";
import { computeStatus, missingForVerified } from "../pairs/status.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(n);
  return i === -1 ? undefined : process.argv[i + 1];
};

function findPair(object: string): string {
  for (const db of readdirSync(resolve(ROOT, "pairs"))) {
    const p = resolve(ROOT, "pairs", db, `${object}.json`);
    if (existsSync(p)) return p;
  }
  throw new Error(`no pair record for ${object}`);
}

function firstCommitDate(path: string): string | null {
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--follow", "--format=%cs", "--", path], { cwd: ROOT, encoding: "utf-8" }).trim();
    const lines = out.split("\n").filter(Boolean);
    return lines.length ? lines[lines.length - 1] : null;
  } catch {
    return null;
  }
}

function main(): void {
  const object = arg("--object");
  if (!object) throw new Error("--object required");
  const path = findPair(object);
  const rec = JSON.parse(readFileSync(path, "utf-8")) as PairRecord;
  const before = rec.status;

  const minutes = arg("--minutes");
  if (minutes !== undefined) {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0) throw new Error("--minutes must be a positive number");
    rec.effort.humanMinutes = (rec.effort.humanMinutes ?? 0) + m;
    console.log(`${object}: +${m} min (total ${rec.effort.humanMinutes})`);
  }

  const reviewer = arg("--review");
  if (reviewer !== undefined) {
    const date = arg("--date") ?? new Date().toISOString().slice(0, 10);
    const first = firstCommitDate(path);
    if (first && date <= first) {
      throw new Error(`step 5 must be at least one day after the first pass (${first}); review date given: ${date}`);
    }
    const fail = arg("--fail");
    rec.evidence.step5 = fail ? "fail" : "pass";
    rec.evidence.reviewer = reviewer;
    rec.evidence.reviewDate = date;
    if (fail) rec.evidence.failureDetail = `Second review: ${fail}`;
    console.log(`${object}: step 5 ${rec.evidence.step5} by ${reviewer} on ${date}${first ? ` (first pass ${first})` : ""}`);
  }

  // public sample databases: acceptance on real data does not apply (verification-standard.md step 6)
  if (rec.evidence.step6 === "not-run" && typeof rec.origin === "object") rec.evidence.step6 = "n/a";

  const e = rec.evidence;
  const computed = computeStatus(e);
  // a record failed for a reason outside the steps (e.g. not converted) stays failed
  rec.status = computed === "pending" && before === "failed" ? "failed" : computed;

  writeFileSync(path, JSON.stringify(rec, null, 2) + "\n", "utf-8");
  if (rec.status !== before) console.log(`${object}: status ${before} -> ${rec.status}`);
  else if (rec.status !== "verified") {
    console.log(`${object}: status stays ${rec.status} (not yet passing: ${missingForVerified(e).join(", ")})`);
  }
}

main();
