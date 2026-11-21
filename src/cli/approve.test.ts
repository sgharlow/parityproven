import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { readdirSync, readFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { approvalProblem, decideApproval, evidenceFileSha256, ownerConfirmItems, reportObjects, reviewerConfirmed, ttyProblem, type ApproveInput } from "./approve-decision.js";
import { TRAP_IDS, type AdversarialEvidence, type TrapCoverage, type TrapId } from "../adversarial/schema.js";
import type { PairRecord } from "../pairs/schema.js";

const FINAL = "CREATE FUNCTION f() ...";
const SHA = createHash("sha256").update(FINAL).digest("hex");

function evidence(): AdversarialEvidence {
  const traps = Object.fromEntries(
    TRAP_IDS.map((t) => [t, t === "null-vs-empty" ? { applicable: true, coveredBy: ["A01"] } : { applicable: false, coveredBy: [] }]),
  ) as Record<TrapId, TrapCoverage>;
  return {
    schemaVersion: 1, object: "dbo.F", database: "AdventureWorks2025", runAt: "2026-11-19T10:00:00Z", harnessVersion: "0.1.0",
    conversionSha256: SHA,
    attacker: { model: "a", at: "2026-11-19T09:00:00Z", file: "a.json", sha256: "b" },
    auditor: { model: "b", at: "2026-11-19T09:30:00Z", file: "b.json", sha256: "c" },
    sameModel: false, casesAudited: ["A01"], traps,
    cases: [{
      id: "A01", label: "x", traps: ["null-vs-empty"], reasoning: "r", trapChecks: { "null-vs-empty": { present: true, detail: "ok" } },
      status: "ran", sqlServer: { passed: true }, postgres: { passed: true }, differed: false,
    }],
    summary: { ran: 1, differed: 0, invalid: 0 }, objections: [],
    mutantAdequacy: { verdict: "adequate", caught: ["m"], missed: [], skipped: [], equivalentRecorded: [] },
    gate: { passed: true, reasons: [] }, wording: "1 adversarial case ran, 0 differed",
  };
}

function input(): ApproveInput {
  const pair = {
    status: "pending", code: { final: FINAL },
    evidence: { step1: "pass", step2: "pass", step3: "pass", step4: "pass", step5: "not-run", step6: "n/a",
      adversarial: { gate: "pass", ran: 1, differed: 0, evidencePath: "x", conversionSha256: SHA, runAt: "2026-11-19T10:00:00Z" } },
  } as unknown as PairRecord;
  return { name: "AdventureWorks2025 dbo.F", evidence: evidence(), pair, firstCommit: "2026-11-17", date: "2026-11-20" };
}

const why = (i: ApproveInput): string => decideApproval(i).reasons.join(" | ");

describe("decideApproval", () => {
  it("approves a clean object", () => {
    expect(decideApproval(input())).toEqual({ name: "AdventureWorks2025 dbo.F", ok: true, reasons: [] });
  });
  it("refuses missing evidence", () => {
    const i = input(); i.evidence = null;
    expect(why(i)).toContain("no adversarial evidence");
  });
  it("refuses a divergence", () => {
    const i = input(); i.evidence!.cases[0]!.postgres = { passed: false }; i.evidence!.summary.differed = 1;
    expect(why(i)).toContain("1 adversarial case(s) differed");
    expect(why(i)).toContain("gate: case A01 differed");
  });
  it("refuses an invalid case", () => {
    const i = input(); i.evidence!.summary.invalid = 1;
    expect(why(i)).toContain("1 adversarial case(s) invalid");
  });
  it("refuses an open objection", () => {
    const i = input();
    i.evidence!.objections = [{ id: "O1", kind: "weak", text: "t", status: "open" }];
    expect(why(i)).toContain("objection O1 is open");
  });
  it("refuses inadequate attacks", () => {
    const i = input();
    i.evidence!.mutantAdequacy = { verdict: "inadequate", caught: [], missed: ["m"], skipped: [], equivalentRecorded: [] };
    expect(why(i)).toContain("inadequate against the planted defects");
  });
  it("refuses a stale conversion hash", () => {
    const i = input(); i.pair.code.final = FINAL + " changed";
    expect(why(i)).toContain("evidence is stale");
  });
  it("refuses a pair record whose gate is not pass", () => {
    const i = input(); i.pair.evidence.adversarial!.gate = "fail";
    expect(why(i)).toContain("not pass");
  });
  it("refuses when a step before 5 did not pass", () => {
    const i = input(); i.pair.evidence.step3 = "fail";
    expect(why(i)).toContain("step 3");
    const j = input(); j.pair.evidence.step4 = "not-run";
    expect(why(j)).toContain("step 4");
  });
  it("refuses a failed record", () => {
    const i = input(); i.pair.status = "failed";
    expect(why(i)).toContain("failed");
  });
  it("refuses a date that is not a day after the first pass", () => {
    const i = input(); i.date = "2026-11-17";
    expect(why(i)).toContain("at least one day");
  });
  it("allows step 4 n/a", () => {
    const i = input(); i.pair.evidence.step4 = "n/a";
    expect(decideApproval(i).ok).toBe(true);
  });
});

describe("decideApproval: the one-day rule (ruling D1)", () => {
  it("refuses a review on the day the adversarial gate ran, and says which date starts the clock", () => {
    const i = input(); i.date = "2026-11-19";
    expect(why(i)).toContain("at least one day after the first pass (2026-11-19)");
  });
  it("refuses a review on the day the conversion last changed", () => {
    const i = input(); i.conversionChanged = "2026-11-20";
    expect(why(i)).toContain("(2026-11-20)");
  });
  it("accepts a review the day after both the conversion change and the gate run", () => {
    const i = input(); i.conversionChanged = "2026-11-18";
    expect(decideApproval(i).ok).toBe(true);
  });
});

describe("ownerConfirmItems", () => {
  it("lists resolved objections, accepted not-applicable traps and equivalent mutants", () => {
    const ev = evidence();
    ev.objections = [{ id: "O1", kind: "weak", text: "t", status: "resolved", resolution: "fixed" }];
    ev.traps["collation-case"] = { applicable: true, coveredBy: [], notApplicableReason: "no text", accepted: true };
    ev.mutantAdequacy.equivalentRecorded = ["m2"];
    const items = ownerConfirmItems(ev);
    expect(items).toHaveLength(3);
    expect(items.join("|")).toContain("O1");
    expect(items.join("|")).toContain("m2");
  });
  it("lists nothing for a clean object", () => {
    expect(ownerConfirmItems(evidence())).toEqual([]);
  });
});

describe("terminal guard", () => {
  it("refuses when stdin or stdout is not a TTY", () => {
    expect(ttyProblem(false, true)).toContain("TTY");
    expect(ttyProblem(true, false)).toContain("TTY");
    expect(ttyProblem(undefined, undefined)).toContain("TTY");
    expect(ttyProblem(true, true)).toBeNull();
  });
  it("needs the reviewer name retyped", () => {
    expect(reviewerConfirmed("Steve", "Steve ")).toBe(true);
    expect(reviewerConfirmed("Steve", "Bob")).toBe(false);
    expect(reviewerConfirmed("", "")).toBe(false);
  });
});

describe("reportObjects", () => {
  it("lists the object headings and ignores the approval heading", () => {
    const text = "# Adversarial evidence report: batch 1\n## AdventureWorks2025 dbo.F\nx\n## WideWorldImporters Website.Customers\n## Approval\n";
    expect(reportObjects(text)).toEqual([
      { database: "AdventureWorks2025", object: "dbo.F" },
      { database: "WideWorldImporters", object: "Website.Customers" },
    ]);
  });
});

describe("approvalProblem", () => {
  const ev = (): PairRecord["evidence"] => ({ step5Method: "adversarial-report", step5EvidenceSha256: evidenceFileSha256("{}") }) as unknown as PairRecord["evidence"];
  it("accepts an approval whose evidence file is unchanged", () => {
    expect(approvalProblem(ev(), "{}")).toBeNull();
  });
  it("flags an evidence file edited after approval (e.g. a confirmedBy added)", () => {
    expect(approvalProblem(ev(), '{"objections":[]}')).toContain("changed after the owner approved it");
  });
  it("flags a missing hash or a missing file", () => {
    const e = ev(); delete e.step5EvidenceSha256;
    expect(approvalProblem(e, "{}")).toContain("hash is not recorded");
    expect(approvalProblem(ev(), null)).toContain("file is missing");
  });
  it("ignores records not approved on a report", () => {
    expect(approvalProblem({} as PairRecord["evidence"], null)).toBeNull();
  });
  it("holds for every committed pair record", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const problems: string[] = [];
    for (const db of readdirSync(join(root, "pairs"))) {
      const dir = join(root, "pairs", db);
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
        const e = (JSON.parse(readFileSync(join(dir, f), "utf-8")) as PairRecord).evidence;
        const p = e.adversarial?.evidencePath ? join(root, e.adversarial.evidencePath) : null;
        const problem = approvalProblem(e, p && existsSync(p) ? readFileSync(p, "utf-8") : null);
        if (problem) problems.push(`${db}/${f}: ${problem}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
