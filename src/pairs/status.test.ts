import { describe, it, expect } from "vitest";
import { computeStatus, missingForVerified } from "./status.js";
import type { PairRecord } from "./schema.js";

type E = PairRecord["evidence"];
const gate = (g: "pass" | "fail" | "not-run"): E["adversarial"] => ({ gate: g, ran: 3, differed: 0, evidencePath: "evidence/adversarial/x.json", conversionSha256: "a", runAt: "2026-11-19T10:00:00Z" });
const ev = (o: Partial<E> = {}): E => ({
  step1: "pass", step2: "pass", step3: "pass", step4: "pass", step5: "pass", step6: "n/a", harnessVersion: "t", adversarial: gate("pass"), ...o,
});

describe("computeStatus", () => {
  it("is verified when every step passes and the adversarial gate passed", () => {
    expect(computeStatus(ev())).toBe("verified");
    expect(missingForVerified(ev())).toEqual([]);
  });

  it("is pending without a passing gate, whatever the steps say", () => {
    for (const a of [undefined, gate("not-run"), gate("fail")]) {
      const e = ev({ adversarial: a });
      expect(computeStatus(e)).toBe("pending");
      expect(missingForVerified(e)).toEqual(["adversarial gate"]);
    }
  });

  it("is failed when any step failed, even with a passing gate", () => {
    expect(computeStatus(ev({ step3: "fail" }))).toBe("failed");
  });

  it("needs step 5, steps 1 to 3, and allows n/a only on steps 4 and 6", () => {
    expect(computeStatus(ev({ step5: "not-run" }))).toBe("pending");
    expect(computeStatus(ev({ step5: "n/a" }))).toBe("pending");
    expect(computeStatus(ev({ step2: "not-run" }))).toBe("pending");
    expect(computeStatus(ev({ step2: "n/a" }))).toBe("pending");
    expect(computeStatus(ev({ step4: "n/a" }))).toBe("verified");
    expect(computeStatus(ev({ step6: "pass" }))).toBe("verified");
    expect(computeStatus(ev({ step6: "not-run" }))).toBe("pending");
    expect(computeStatus(ev({ step4: "not-run" }))).toBe("pending");
    expect(missingForVerified(ev({ step5: "not-run", step6: "not-run" }))).toEqual(["step5", "step6"]);
  });
});
