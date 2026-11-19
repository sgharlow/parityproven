/** The approve decision (ruling A1), pure: engine-free, no clock, no git, no TTY. */
import { createHash } from "crypto";
import { gateResult } from "../adversarial/gate.js";
import type { AdversarialEvidence } from "../adversarial/schema.js";
import { oneDayProblem } from "../pairs/review-rules.js";
import type { PairRecord } from "../pairs/schema.js";

export interface ApproveInput {
  /** Object as listed in the report: "<database> <Schema.Name>" */
  name: string;
  /** Parsed evidence JSON, or null when the file is missing. */
  evidence: AdversarialEvidence | null;
  pair: PairRecord;
  /** Date of the pair record's first commit (null when git has none). */
  firstCommit: string | null;
  date: string;
}

export interface ApproveDecision {
  name: string;
  ok: boolean;
  reasons: string[];
}

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/** Re-evaluates the gate from the evidence JSON and refuses on any divergence, objection, inadequate attack or stale hash. */
export function decideApproval(i: ApproveInput): ApproveDecision {
  const reasons: string[] = [];
  const e = i.pair.evidence;
  const ev = i.evidence;

  if (!ev) reasons.push("no adversarial evidence file");
  else {
    const finalSha = sha256(i.pair.code.final);
    const g = gateResult(ev, finalSha);
    reasons.push(...g.reasons.map((r) => `gate: ${r}`));
    if (ev.summary.differed > 0) reasons.push(`${ev.summary.differed} adversarial case(s) differed`);
    if (ev.summary.invalid > 0) reasons.push(`${ev.summary.invalid} adversarial case(s) invalid`);
    if (ev.mutantAdequacy.verdict === "inadequate") reasons.push("the adversarial cases are inadequate against the planted defects");
    if (ev.conversionSha256 !== finalSha) reasons.push("the evidence is stale: the conversion changed since the gate ran");
    if (e.adversarial?.conversionSha256 !== undefined && e.adversarial.conversionSha256 !== ev.conversionSha256) reasons.push("the pair record's gate hash differs from the evidence file");
  }

  if (e.adversarial?.gate !== "pass") reasons.push(`pair record gate is ${e.adversarial?.gate ?? "not-run"}, not pass`);
  if (i.pair.status === "failed") reasons.push("pair record status is failed");
  for (const [n, s] of [[1, e.step1], [2, e.step2], [3, e.step3]] as const) if (s !== "pass") reasons.push(`step ${n} is ${s}, not pass`);
  if (e.step4 !== "pass" && e.step4 !== "n/a") reasons.push(`step 4 is ${e.step4}, not pass or n/a`);

  const d = oneDayProblem(i.firstCommit, i.date);
  if (d) reasons.push(d);

  return { name: i.name, ok: reasons.length === 0, reasons };
}

/** Problem text when the process is not an interactive terminal (a workflow step or a pipe is refused). */
export function ttyProblem(stdinIsTty: boolean | undefined, stdoutIsTty: boolean | undefined): string | null {
  return stdinIsTty && stdoutIsTty ? null : "approve needs an interactive terminal (stdin and stdout must be a TTY); agents and workflow steps cannot run it";
}

/** Reviewer name retyped at the prompt must equal --reviewer. */
export function reviewerConfirmed(given: string, retyped: string): boolean {
  return given.trim().length > 0 && given.trim() === retyped.trim();
}

/** Objects listed in a batch report: the "## <database> <Schema.Name>" headings. */
export function reportObjects(text: string): Array<{ database: string; object: string }> {
  const out: Array<{ database: string; object: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^## (\S+) (\S+)\s*$/);
    if (m) out.push({ database: m[1]!, object: m[2]! });
  }
  return out;
}
