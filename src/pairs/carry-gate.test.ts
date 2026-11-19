import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { carriedGateFields } from "./carry-gate.js";
import type { PairRecord } from "./schema.js";

const FINAL = "CREATE FUNCTION f() ...";
const SHA = createHash("sha256").update(FINAL).digest("hex");
const prev = (): PairRecord => ({
  evidence: {
    adversarial: { gate: "pass", ran: 3, differed: 0, evidencePath: "e.json", conversionSha256: SHA, runAt: "2026-11-19T10:00:00Z" },
    step5Method: "adversarial-report", step5Report: "r.md", step5EvidenceSha256: "abc", step5Confirmed: ["x"],
  },
}) as unknown as PairRecord;

describe("carriedGateFields", () => {
  it("keeps the gate and approval when the conversion is unchanged", () => {
    expect(carriedGateFields(prev(), FINAL)).toEqual({
      adversarial: prev().evidence.adversarial, step5Method: "adversarial-report", step5Report: "r.md", step5EvidenceSha256: "abc", step5Confirmed: ["x"],
    });
  });
  it("drops them when the conversion changed", () => {
    expect(carriedGateFields(prev(), FINAL + " ")).toEqual({});
  });
  it("has nothing to keep without a previous gate", () => {
    expect(carriedGateFields(null, FINAL)).toEqual({});
  });
});
