import { describe, it, expect } from "vitest";
import { buildEvidence, wordingOf, type EvidenceInput } from "./evidence.js";
import { buildReport } from "./report.js";
import { specByName } from "../conversions/specs.js";
import { parseCases, parseAudit } from "./load.js";
import type { PairRecord } from "../pairs/schema.js";

const spec = specByName("dbo.ufnLeadingZeros")!;
const q = "dbo.ufnLeadingZeros";
const casesJson = {
  schemaVersion: 1, object: q, database: spec.database, attacker: { model: "m-a", at: "2026-11-19T00:00:00Z" },
  cases: [
    { id: "A01", label: "five", traps: [], reasoning: "padding", fixedCase: { args: [5], tables: {} } },
    { id: "A02", label: "nine digits", traps: [], reasoning: "overflow gives *", fixedCase: { args: [100000000], tables: {} } },
  ],
};
const auditJson = (extra: object = {}) => ({
  schemaVersion: 1, object: q, database: spec.database, auditor: { model: "m-b", at: "2026-11-19T01:00:00Z" },
  casesAudited: ["A01", "A02"], acceptedNotApplicable: [], equivalentMutants: [], objections: [], ...extra,
});
const input = (over: Partial<EvidenceInput> = {}): EvidenceInput => ({
  spec,
  cases: parseCases(casesJson, spec),
  casesFile: { path: "c.json", sha256: "1" },
  audit: parseAudit(auditJson(), spec),
  auditFile: { path: "a.json", sha256: "2" },
  finalSha256: "f",
  outcome: {
    tests: [
      { engine: "SQL Server", name: "t1", passed: true, caseIndex: 0 }, { engine: "PostgreSQL", name: "t1", passed: true, caseIndex: 0 },
      { engine: "SQL Server", name: "t2", passed: true, caseIndex: 1 }, { engine: "PostgreSQL", name: "t2", passed: true, caseIndex: 1 },
    ],
    defects: { caught: ["m1"], missed: [], skipped: [] },
  },
  harnessVersion: "h", runAt: "2026-11-19T02:00:00Z", ...over,
});

describe("buildEvidence", () => {
  it("passes when both engines pass every case and the planted defect is caught", () => {
    const ev = buildEvidence(input());
    expect(ev.gate).toEqual({ passed: true, reasons: [] });
    expect(ev.wording).toBe("2 adversarial cases ran, 0 differed");
    expect(ev.sameModel).toBe(false);
  });
  it("counts a case that fails on PostgreSQL as differed and fails the gate", () => {
    const base = input();
    const o = base.outcome;
    o.tests[1] = { engine: "PostgreSQL", name: "t1", passed: false, message: "agreed test failed", caseIndex: 0 };
    const ev = buildEvidence(base);
    expect(ev.summary.differed).toBe(1);
    expect(ev.gate.passed).toBe(false);
    expect(ev.wording).toBe("2 adversarial cases ran, 1 differed");
  });
  it("marks a case the original T-SQL could not run as invalid and fails the gate", () => {
    const base = input();
    base.outcome.tests = base.outcome.tests.filter((t) => t.caseIndex !== 1);
    base.outcome.invalid = [{ index: 1, label: "nine digits", reason: "the original T-SQL raised an undeclared error: x" }];
    const ev = buildEvidence(base);
    expect(ev.summary).toEqual({ ran: 1, differed: 0, invalid: 1 });
    expect(ev.gate.passed).toBe(false);
  });
  it("fails the gate on an unexplained missed planted defect, and accepts one the auditor recorded as equivalent", () => {
    const missed = input({ outcome: { ...input().outcome, defects: { caught: [], missed: ["m2"], skipped: [] } } });
    expect(buildEvidence(missed).mutantAdequacy.verdict).toBe("inadequate");
    expect(buildEvidence(missed).gate.passed).toBe(false);
    const explained = { ...missed, audit: parseAudit(auditJson({ equivalentMutants: [{ name: "m2", reason: "unobservable" }] }), spec) };
    const ev = buildEvidence(explained);
    expect(ev.mutantAdequacy.equivalentRecorded).toEqual(["m2"]);
    expect(ev.gate.passed).toBe(true);
  });
  it("fails the gate when an objection is open", () => {
    const audit = parseAudit(auditJson({ objections: [{ id: "O1", kind: "weak", text: "x", status: "open" }] }), spec);
    expect(buildEvidence(input({ audit })).gate.passed).toBe(false);
  });
  it("pluralises the wording", () => {
    expect(wordingOf(1, 0)).toBe("1 adversarial case ran, 0 differed");
  });
});

describe("buildReport", () => {
  it("lists the checklist items, the gate result and the approve command", () => {
    const ev = buildEvidence(input());
    const pair = { columnMappings: [{ sqlServerType: "int", postgresType: "integer" }], code: { notes: ["n1"] }, evidence: { testsRun: ["x"], samples: 5 } } as unknown as PairRecord;
    const md = buildReport("1", [{ evidence: ev, pair, evidencePath: "evidence/adversarial/x.json" }], "2026-11-19");
    expect(md).toContain("2 adversarial cases ran, 0 differed");
    expect(md).toContain("int -> integer");
    expect(md).toContain("owner judgment");
    expect(md).toContain("npm run approve -- --report evidence/adversarial/reports/batch-1.md");
    expect(md.match(/^\| (The|NULL|Collation|Dates|Numeric|Trailing|Every|The|Each)/gm)?.length).toBeGreaterThanOrEqual(9);
  });
});
