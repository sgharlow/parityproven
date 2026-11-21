import { describe, it, expect } from "vitest";
import { assertOneDay, firstPassDate, oneDayProblem } from "./review-rules.js";

describe("oneDayProblem", () => {
  it("accepts a date after the first pass", () => {
    expect(oneDayProblem("2026-11-17", "2026-11-18")).toBeNull();
  });
  it("refuses the same day and earlier days", () => {
    expect(oneDayProblem("2026-11-18", "2026-11-18")).toContain("at least one day");
    expect(oneDayProblem("2026-11-18", "2026-11-17")).toContain("at least one day");
  });
  it("accepts any valid date when git has no first commit", () => {
    expect(oneDayProblem(null, "2026-11-18")).toBeNull();
  });
  it("refuses a malformed date", () => {
    expect(oneDayProblem(null, "18/11/2026")).toContain("not a yyyy-mm-dd");
    expect(oneDayProblem(null, "2026-13-45")).toContain("not a yyyy-mm-dd");
  });
  it("assertOneDay throws on a problem", () => {
    expect(() => assertOneDay("2026-11-18", "2026-11-18")).toThrow();
    expect(() => assertOneDay("2026-11-17", "2026-11-18")).not.toThrow();
  });
});

describe("firstPassDate (ruling D1)", () => {
  it("is the latest of the pair record's first commit, the conversion's last change and the gate run day", () => {
    expect(firstPassDate({ pairFirstCommit: "2026-11-10", conversionChanged: "2026-11-18", gateRunAt: "2026-11-19T17:49:03.769Z" })).toBe("2026-11-19");
    expect(firstPassDate({ pairFirstCommit: "2026-11-10", conversionChanged: "2026-11-21", gateRunAt: "2026-11-19T17:49:03.769Z" })).toBe("2026-11-21");
    expect(firstPassDate({ pairFirstCommit: "2026-11-22", conversionChanged: "2026-11-18" })).toBe("2026-11-22");
  });
  it("ignores dates that are missing, and is null when all are", () => {
    expect(firstPassDate({ pairFirstCommit: null, conversionChanged: "2026-11-18", gateRunAt: null })).toBe("2026-11-18");
    expect(firstPassDate({ pairFirstCommit: null })).toBeNull();
  });
});
