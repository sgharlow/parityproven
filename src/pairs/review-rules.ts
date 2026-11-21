/** Rules for step 5 shared by log-effort and approve: the review comes at least one day after the first pass (ruling D1: see firstPassDate). */
import { execFileSync } from "child_process";

/** Date (yyyy-mm-dd) of the commit that first added `path`, or null when git has no history for it. */
export function firstCommitDate(root: string, path: string): string | null {
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--follow", "--format=%cs", "--", path], { cwd: root, encoding: "utf-8" }).trim();
    const lines = out.split("\n").filter(Boolean);
    return lines.length ? lines[lines.length - 1]! : null;
  } catch {
    return null;
  }
}

/** Date (yyyy-mm-dd) of the last commit that changed an object's conversion file, or null when git has none. */
export function conversionChangeDate(root: string, database: string, object: string): string | null {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", `conversions/${database}/${object}.sql`], { cwd: root, encoding: "utf-8" }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/**
 * Ruling D1 (owner, 2026-11-20): "first pass" is the latest of three dates, so a review can never fall on the day of the
 * evidence it signs: the pair record's first commit, the date the reviewed conversion last changed, and the day the adversarial
 * gate last ran on it (the gate's `runAt`, UTC). A conversion that changes, or a gate that re-runs, starts the clock again.
 */
export function firstPassDate(d: { pairFirstCommit: string | null; conversionChanged?: string | null; gateRunAt?: string | null }): string | null {
  const dates = [d.pairFirstCommit, d.conversionChanged ?? null, d.gateRunAt ? d.gateRunAt.slice(0, 10) : null].filter((x): x is string => !!x);
  return dates.length ? dates.reduce((a, b) => (a >= b ? a : b)) : null;
}

/** Problem text when `date` is not a valid yyyy-mm-dd date at least one day after `first`; null when it is fine. */
export function oneDayProblem(first: string | null, date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return `review date "${date}" is not a yyyy-mm-dd date`;
  if (first && date <= first) return `step 5 must be at least one day after the first pass (${first}); review date given: ${date}`;
  return null;
}

/** Throws when `oneDayProblem` finds one. */
export function assertOneDay(first: string | null, date: string): void {
  const p = oneDayProblem(first, date);
  if (p) throw new Error(p);
}
