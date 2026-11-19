/** Rules for step 5 shared by log-effort and approve: the review comes at least one day after the first pass. */
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
