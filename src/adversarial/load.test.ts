import { describe, it, expect } from "vitest";
import { parseAudit, parseCases, reviveBytes } from "./load.js";
import type { ObjectSpec } from "../harness/generic/spec.js";
import { CHECKLIST, checklistLines } from "../pairs/checklist.js";

const spec = {
  database: "T", schema: "dbo", name: "P", objectClass: "procedure", windowParams: false, orderKey: [], pgFunction: "dbo.p",
  tables: [{ schema: "dbo", name: "T", columns: [{ name: "Id", type: { kind: "int" } }, { name: "Name", type: { kind: "nvarchar", n: 9 } }, { name: "Img", type: { kind: "varbinary" } }] }],
  params: [{ name: "@n", type: { kind: "int" } }],
} as unknown as ObjectSpec;

const stamp = { model: "m", at: "2026-11-19T10:00:00Z" };
const caseA = (o: Record<string, unknown> = {}) => ({
  id: "A01", label: "one", traps: ["null-vs-empty"], reasoning: "r",
  fixedCase: { tables: { "dbo.T": [{ Id: 1, Name: "" }] } }, ...o,
});
const file = (cases: unknown[], o: Record<string, unknown> = {}) => ({ schemaVersion: 1, object: "dbo.P", database: "T", attacker: stamp, cases, ...o });

describe("parseCases", () => {
  it("accepts a valid file and builds fixed cases labelled like the case", () => {
    const f = parseCases(file([caseA()]), spec);
    expect(f.cases[0].fixedCase.label).toBe("one");
    expect(f.cases[0].fixedCase.tables["dbo.T"]).toEqual([{ Id: 1, Name: "" }]);
  });

  it("revives bytes", () => {
    const f = parseCases(file([caseA({ fixedCase: { tables: { "dbo.T": [{ Id: 1, Img: { $hex: "0aff" } }] } } })]), spec);
    expect(f.cases[0].fixedCase.tables["dbo.T"][0].Img).toEqual(new Uint8Array([10, 255]));
    expect(() => reviveBytes({ $hex: "zz" })).toThrow(/hex/);
  });

  it("rejects duplicate ids and labels", () => {
    expect(() => parseCases(file([caseA(), caseA({ label: "two" })]), spec)).toThrow(/duplicate id A01/);
    expect(() => parseCases(file([caseA(), caseA({ id: "A02" })]), spec)).toThrow(/duplicate label/);
  });

  it("rejects values the runner cannot use, with the reason", () => {
    expect(() => parseCases(file([caseA({ fixedCase: { tables: { "dbo.T": [{ Id: "abc" }] } } })]), spec)).toThrow(/cannot use "abc" as a int/);
    expect(() => parseCases(file([caseA({ fixedCase: { tables: { "dbo.T": [{ Nope: 1 }] } } })]), spec)).toThrow(/unknown column Nope/);
    expect(() => parseCases(file([caseA({ fixedCase: { tables: { "dbo.X": [] } } })]), spec)).toThrow(/table dbo.X is not in the spec/);
    expect(() => parseCases(file([caseA({ fixedCase: { tables: {}, args: [1, 2] } })]), spec)).toThrow(/argument 2/);
  });

  it("rejects bad ids, unknown traps, a wrong object and missing fields", () => {
    expect(() => parseCases(file([caseA({ id: "x1" })]), spec)).toThrow(/must look like A01/);
    expect(() => parseCases(file([caseA({ traps: ["nope"] })]), spec)).toThrow(/unknown trap/);
    expect(() => parseCases(file([caseA()], { object: "dbo.Q" }), spec)).toThrow(/expected dbo.P/);
    expect(() => parseCases(file([caseA({ reasoning: "" })]), spec)).toThrow(/reasoning/);
    expect(() => parseCases(file([]), spec)).toThrow(/non-empty/);
    expect(() => parseCases(file([caseA()], { attacker: { model: "m", at: "x" } }), spec)).toThrow(/timestamp/);
  });

  it("requires cutoffs exactly for window objects", () => {
    const w = { ...spec, windowParams: true } as ObjectSpec;
    expect(() => parseCases(file([caseA()]), w)).toThrow(/cutoffs/);
    expect(() => parseCases(file([caseA({ fixedCase: { tables: {}, cutoffs: { last: "a", new: "b" } } })]), spec)).toThrow(/no cutoff/);
    expect(parseCases(file([caseA({ fixedCase: { tables: {}, cutoffs: { last: "a", new: "b" } } })]), w).cases[0].fixedCase.cutoffs).toEqual({ last: "a", new: "b" });
  });

  it("keeps notApplicable reasons and the regression flag", () => {
    const f = parseCases(file([caseA({ regression: true })], { notApplicable: { "top-ties": "scalar" } }), spec);
    expect(f.notApplicable).toEqual({ "top-ties": "scalar" });
    expect(f.cases[0].regression).toBe(true);
    expect(() => parseCases(file([caseA()], { notApplicable: { bogus: "x" } }), spec)).toThrow(/unknown trap/);
  });
});

describe("parseAudit", () => {
  const audit = (o: Record<string, unknown> = {}) => ({
    schemaVersion: 1, object: "dbo.P", database: "T", auditor: stamp, casesAudited: ["A01"], acceptedNotApplicable: [], equivalentMutants: [], objections: [], ...o,
  });
  it("accepts a valid file", () => {
    expect(parseAudit(audit(), spec).casesAudited).toEqual(["A01"]);
    const o = { id: "O1", kind: "weak", text: "t", status: "resolved", resolution: "r", confirmedBy: stamp };
    expect(parseAudit(audit({ objections: [o] }), spec).objections[0].confirmedBy).toEqual(stamp);
  });
  it("rejects bad kinds, statuses and duplicate objection ids", () => {
    expect(() => parseAudit(audit({ objections: [{ id: "O1", kind: "x", text: "t", status: "open" }] }), spec)).toThrow(/kind/);
    expect(() => parseAudit(audit({ objections: [{ id: "O1", kind: "weak", text: "t", status: "maybe" }] }), spec)).toThrow(/status/);
    const o = { id: "O1", kind: "weak", text: "t", status: "open" };
    expect(() => parseAudit(audit({ objections: [o, o] }), spec)).toThrow(/duplicate/);
    expect(() => parseAudit(audit({ equivalentMutants: [{ name: "m" }] }), spec)).toThrow(/reason/);
  });
});

describe("checklist", () => {
  it("keeps the ten step-5 lines, the last one only when agreed tests exist", () => {
    expect(CHECKLIST).toHaveLength(10);
    expect(checklistLines(true)).toHaveLength(10);
    expect(checklistLines(false)).toHaveLength(9);
    expect(checklistLines(true)[0]).toBe("- [ ] The conversion does what the T-SQL does for every input the object accepts, not only for the generated ones.");
    expect(checklistLines(true)[9]).toBe("- [ ] Each agreed test's expected result is what its label says the T-SQL should return (they were captured from the source engine).");
  });
});
