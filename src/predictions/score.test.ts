import { describe, expect, it } from "vitest";
import { scorePredictions } from "./score.js";
import type { PredictionFile } from "./schema.js";
import type { PairRecord } from "../pairs/schema.js";

const pred: PredictionFile = {
  database: "WideWorldImporters",
  version: 1,
  committedAt: "2026-11-08T03:31:14.477Z",
  basis: "test",
  cellEstimates: [
    { objectClass: "procedure", tier: "simple", count: 2, p50Hours: 1, p90Hours: 2 },
    { objectClass: "procedure", tier: "medium", count: 1, p50Hours: 3, p90Hours: 6 },
    { objectClass: "procedure", tier: "complex", count: 1, p50Hours: 9, p90Hours: 20 },
  ],
  expectedFailures: [
    { schema: "Integration", object: "GetCityUpdates", reason: "cursor" },
    { schema: "DataLoadSimulation", object: "PopulateDataToCurrentDate", reason: "simulation" },
  ],
} as unknown as PredictionFile;

function pair(source: string, status: PairRecord["status"], minutes = 0, engine = "kiro"): PairRecord {
  return {
    objectClass: "procedure", tier: "complex", status,
    code: { source, engineOutput: "", final: "", diff: "", engine },
    evidence: {}, effort: { humanMinutes: minutes, engineName: "Kiro", engineVersion: "x" },
  } as unknown as PairRecord;
}

describe("scorePredictions", () => {
  it("empty pair records: every actual is null and every predicted failure is untested", () => {
    const r = scorePredictions(pred, [], []);
    expect(r.cells.every((c) => c.actualAvgMinutes === null && c.verified + c.pending + c.failed === 0)).toBe(true);
    expect(r.failurePredictions.every((f) => f.confirmed === null)).toBe(true);
    expect(r.unpredictedFailures).toEqual([]);
  });

  it("scores an object in the cell it was predicted in (tier rules as of the predictions)", () => {
    // EXECUTE (@sql) became complex on 2026-11-11; under the rules the predictions used, this is a table-variable procedure (medium)
    const src = "CREATE PROCEDURE p AS DECLARE @t TABLE (a int); EXECUTE (@sql);";
    const r = scorePredictions(pred, [pair(src, "pending")], ["Sequences.Reseed"]);
    expect(r.cells.find((c) => c.tier === "medium")?.pending).toBe(1);
    expect(r.cells.find((c) => c.tier === "complex")?.pending).toBe(0);
  });

  it("a predicted failure ruled out of scope is reported as excluded, not as not-yet-run", () => {
    const r = scorePredictions(pred, [], [], new Map([["DataLoadSimulation.PopulateDataToCurrentDate", "data-load simulation"]]));
    const f = r.failurePredictions.find((x) => x.object === "PopulateDataToCurrentDate");
    expect(f?.excludedReason).toBe("data-load simulation");
    expect(f?.confirmed).toBeNull();
  });

  it("actual effort averages only completed objects with logged minutes", () => {
    const src = "CREATE PROCEDURE p AS SELECT 1;";
    const r = scorePredictions(pred, [pair(src, "failed", 30), pair(src, "failed", 0), pair(src, "pending", 90)], ["a.b", "a.c", "a.d"]);
    expect(r.cells.find((c) => c.tier === "simple")?.actualAvgMinutes).toBe(30);
  });
});
