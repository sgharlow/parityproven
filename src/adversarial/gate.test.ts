import { describe, it, expect } from "vitest";
import { adequacyVerdict, gateResult } from "./gate.js";
import { TRAP_IDS, type AdversarialEvidence, type TrapCoverage, type TrapId } from "./schema.js";

const SHA = "a".repeat(64);

function good(): AdversarialEvidence {
  const traps = Object.fromEntries(
    TRAP_IDS.map((t) => [t, t === "null-vs-empty" ? { applicable: true, coveredBy: ["A01"] } : { applicable: false, coveredBy: [] }]),
  ) as Record<TrapId, TrapCoverage>;
  return {
    schemaVersion: 1,
    object: "dbo.F",
    database: "AdventureWorks2025",
    runAt: "2026-11-19T10:00:00Z",
    harnessVersion: "0.1.0",
    conversionSha256: SHA,
    attacker: { model: "model-a", at: "2026-11-19T09:00:00Z", file: "a.json", sha256: "b" },
    auditor: { model: "model-b", at: "2026-11-19T09:30:00Z", file: "b.json", sha256: "c" },
    sameModel: false,
    casesAudited: ["A01"],
    traps,
    cases: [
      {
        id: "A01", label: "empty and NULL", traps: ["null-vs-empty"], reasoning: "T-SQL '' differs from NULL",
        trapChecks: { "null-vs-empty": { present: true, detail: "ok" } },
        status: "ran", sqlServer: { passed: true }, postgres: { passed: true }, differed: false,
      },
    ],
    summary: { ran: 1, differed: 0, invalid: 0 },
    objections: [],
    mutantAdequacy: { verdict: "adequate", caught: ["m1"], missed: [], skipped: [], equivalentRecorded: [] },
    gate: { passed: true, reasons: [] },
    wording: "1 adversarial cases ran, 0 differed",
  };
}

const reasons = (ev: AdversarialEvidence, sha = SHA): string => gateResult(ev, sha).reasons.join(" | ");

describe("gateResult", () => {
  it("passes a clean record", () => {
    expect(gateResult(good(), SHA)).toEqual({ passed: true, reasons: [] });
  });

  it("fails with no cases", () => {
    const ev = good();
    ev.cases = [];
    ev.casesAudited = [];
    expect(reasons(ev)).toContain("no adversarial cases");
  });

  it("fails when a case differed on an engine", () => {
    const ev = good();
    ev.cases[0].postgres = { passed: false, message: "x" };
    expect(reasons(ev)).toContain("case A01 differed");
    const ev2 = good();
    ev2.cases[0].sqlServer = { passed: false };
    expect(reasons(ev2)).toContain("case A01 differed");
  });

  it("fails when the differed flag is set although both engines passed", () => {
    const ev = good();
    ev.cases[0].differed = true;
    expect(reasons(ev)).toContain("case A01 differed");
  });

  it("fails when a case did not run on both engines", () => {
    const ev = good();
    delete ev.cases[0].postgres;
    expect(reasons(ev)).toContain("did not run on both engines");
    const ev2 = good();
    delete ev2.cases[0].sqlServer;
    expect(reasons(ev2)).toContain("did not run on both engines");
  });

  it("fails an invalid case and states why", () => {
    const ev = good();
    ev.cases[0].status = "invalid";
    ev.cases[0].invalidReason = "original raised 8134";
    expect(reasons(ev)).toContain("case A01 is invalid: original raised 8134");
  });

  it("fails a claimed trap that is absent from the input", () => {
    const ev = good();
    ev.cases[0].trapChecks["null-vs-empty"] = { present: false, detail: "no NULL" };
    expect(reasons(ev)).toContain("claims null-vs-empty but the input does not contain it (no NULL)");
    const ev2 = good();
    delete ev2.cases[0].trapChecks["null-vs-empty"];
    expect(reasons(ev2)).toContain("claims null-vs-empty");
  });

  it("fails an applicable trap with no covering case", () => {
    const ev = good();
    ev.traps["collation-case"] = { applicable: true, coveredBy: [] };
    expect(reasons(ev)).toContain("applicable trap collation-case is not covered");
  });

  it("does not count a covering case whose trap check is absent or whose claim is missing", () => {
    const ev = good();
    ev.traps["collation-case"] = { applicable: true, coveredBy: ["A01"] };
    expect(reasons(ev)).toContain("applicable trap collation-case is not covered");
    const ev2 = good();
    ev2.cases[0].trapChecks["collation-case"] = { present: true, detail: "x" };
    ev2.traps["collation-case"] = { applicable: true, coveredBy: ["A01"] };
    expect(reasons(ev2)).toContain("applicable trap collation-case is not covered");
    const ev3 = good();
    ev3.cases[0].traps = ["null-vs-empty", "collation-case"];
    ev3.cases[0].trapChecks["collation-case"] = { present: false, detail: "x" };
    ev3.traps["collation-case"] = { applicable: true, coveredBy: ["A01"] };
    expect(reasons(ev3)).toContain("applicable trap collation-case is not covered");
  });

  it("accepts a not-applicable reason only when the auditor accepted it", () => {
    const ev = good();
    ev.traps["top-ties"] = { applicable: true, coveredBy: [], notApplicableReason: "scalar", accepted: true };
    expect(gateResult(ev, SHA).passed).toBe(true);
    ev.traps["top-ties"] = { applicable: true, coveredBy: [], notApplicableReason: "scalar", accepted: false };
    expect(reasons(ev)).toContain("auditor did not accept");
    ev.traps["top-ties"] = { applicable: true, coveredBy: [], notApplicableReason: "scalar" };
    expect(reasons(ev)).toContain("applicable trap top-ties is not covered");
    ev.traps["top-ties"] = { applicable: true, coveredBy: [], accepted: true };
    expect(reasons(ev)).toContain("applicable trap top-ties is not covered");
  });

  it("fails a trap missing from the evidence", () => {
    const ev = good();
    delete (ev.traps as Partial<typeof ev.traps>)["identity-gaps"];
    expect(reasons(ev)).toContain("trap identity-gaps is missing");
  });

  it("fails an open objection, and a resolved one without confirmation", () => {
    const ev = good();
    ev.objections = [{ id: "O1", kind: "weak", text: "t", status: "open" }];
    expect(reasons(ev)).toContain("objection O1 is open");
    ev.objections = [{ id: "O1", kind: "weak", text: "t", status: "resolved", resolution: "r" }];
    expect(reasons(ev)).toContain("objection O1 is resolved but not confirmed");
    ev.objections = [{ id: "O1", kind: "weak", text: "t", status: "resolved", resolution: "r", confirmedBy: { model: "m", at: "2026-11-19T10:00:00Z" } }];
    expect(gateResult(ev, SHA).passed).toBe(true);
  });

  it("fails when audited ids differ from case ids", () => {
    const ev = good();
    ev.casesAudited = [];
    expect(reasons(ev)).toContain("audited case ids differ");
    const ev2 = good();
    ev2.casesAudited = ["A01", "A02"];
    expect(reasons(ev2)).toContain("audited case ids differ");
    const ev3 = good();
    ev3.casesAudited = ["A02"];
    expect(reasons(ev3)).toContain("audited case ids differ");
  });

  it("fails inadequate mutant coverage, including a verdict that contradicts its lists", () => {
    const ev = good();
    ev.mutantAdequacy = { verdict: "inadequate", caught: [], missed: ["m2"], skipped: [], equivalentRecorded: [] };
    expect(reasons(ev)).toContain("mutant adequacy is inadequate (unexplained misses: m2)");
    const ev2 = good();
    ev2.mutantAdequacy = { verdict: "adequate", caught: ["m1"], missed: ["m2"], skipped: [], equivalentRecorded: [] };
    expect(reasons(ev2)).toContain("mutant adequacy is inadequate");
    const ev3 = good();
    ev3.mutantAdequacy = { verdict: "no-mutants", caught: ["m1"], missed: [], skipped: [], equivalentRecorded: [] };
    expect(reasons(ev3)).toContain("does not match its lists");
  });

  it("passes a recorded equivalent miss and the no-mutants verdict", () => {
    const ev = good();
    ev.mutantAdequacy = { verdict: "adequate", caught: ["m1"], missed: ["m2"], skipped: [], equivalentRecorded: ["m2"] };
    expect(gateResult(ev, SHA).passed).toBe(true);
    ev.mutantAdequacy = { verdict: "no-mutants", caught: [], missed: [], skipped: ["m3"], equivalentRecorded: [] };
    expect(gateResult(ev, SHA).passed).toBe(true);
  });

  it("fails a stale conversion hash", () => {
    expect(reasons(good(), "c".repeat(64))).toContain("conversion changed since the gate ran");
  });

  it("fails when a model is not recorded", () => {
    const ev = good();
    ev.attacker.model = " ";
    expect(reasons(ev)).toContain("attacker model not recorded");
    const ev2 = good();
    ev2.auditor.model = "";
    expect(reasons(ev2)).toContain("auditor model not recorded");
  });

  it("does not block when attacker and auditor are the same model", () => {
    const ev = good();
    ev.sameModel = true;
    ev.auditor.model = ev.attacker.model;
    expect(gateResult(ev, SHA).passed).toBe(true);
  });

  it("reports every reason, not only the first", () => {
    const ev = good();
    ev.cases[0].postgres = { passed: false };
    ev.objections = [{ id: "O1", kind: "weak", text: "t", status: "open" }];
    expect(gateResult(ev, "z").reasons.length).toBe(3);
  });
});

describe("adequacyVerdict", () => {
  it("is no-mutants when nothing ran", () => {
    expect(adequacyVerdict({ caught: [], missed: [], equivalentRecorded: [] })).toBe("no-mutants");
  });
  it("is adequate when all were caught", () => {
    expect(adequacyVerdict({ caught: ["a"], missed: [], equivalentRecorded: [] })).toBe("adequate");
  });
  it("is inadequate with an unexplained miss", () => {
    expect(adequacyVerdict({ caught: ["a"], missed: ["b"], equivalentRecorded: [] })).toBe("inadequate");
    expect(adequacyVerdict({ caught: [], missed: ["b"], equivalentRecorded: [] })).toBe("inadequate");
    expect(adequacyVerdict({ caught: ["a"], missed: ["b", "c"], equivalentRecorded: ["b"] })).toBe("inadequate");
  });
  it("is adequate when every miss is recorded as equivalent", () => {
    expect(adequacyVerdict({ caught: [], missed: ["b"], equivalentRecorded: ["b"] })).toBe("adequate");
  });
});
