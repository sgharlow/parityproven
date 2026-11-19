import { describe, it, expect } from "vitest";
import { assertOneDay, oneDayProblem } from "./review-rules.js";

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
