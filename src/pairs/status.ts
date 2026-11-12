/**
 * The status rule, in one place (verification-standard.md, with the project owner's rulings of 2026-11-12):
 *  - verified: steps 1, 2, 3 and 5 pass; step 4 passes, or is "n/a" for an object that changes data (ruling D4a);
 *    step 6 passes, or is "n/a" for a public sample database (ruling D6).
 *  - failed: any step failed.
 *  - pending: otherwise.
 */
import type { PairRecord, StepStatus } from "./schema.js";

export const STEP4_NA_REASON =
  "Step 4 is n/a for objects that change data (ruling 2026-11-12): each call changes the data it reads, so repeated timed runs on the same data are not the same work.";
export const STEP6_NA_REASON = "Step 6 is n/a for public sample databases (verification-standard.md).";

export function computeStatus(e: PairRecord["evidence"]): PairRecord["status"] {
  const steps: StepStatus[] = [e.step1, e.step2, e.step3, e.step4, e.step5, e.step6];
  if (steps.includes("fail")) return "failed";
  const ok = (s: StepStatus, naAllowed: boolean) => s === "pass" || (naAllowed && s === "n/a");
  return ok(e.step1, false) && ok(e.step2, false) && ok(e.step3, false) && ok(e.step4, true) && ok(e.step5, false) && ok(e.step6, true)
    ? "verified"
    : "pending";
}

/** Steps still standing between a record and "verified". */
export function missingForVerified(e: PairRecord["evidence"]): string[] {
  const out: string[] = [];
  if (e.step1 !== "pass") out.push("step1");
  if (e.step2 !== "pass") out.push("step2");
  if (e.step3 !== "pass") out.push("step3");
  if (e.step4 !== "pass" && e.step4 !== "n/a") out.push("step4");
  if (e.step5 !== "pass") out.push("step5");
  if (e.step6 !== "pass" && e.step6 !== "n/a") out.push("step6");
  return out;
}
