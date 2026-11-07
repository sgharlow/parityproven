import { describe, it, expect } from "vitest";
import { buildReport } from "./report.js";
import type { InventoryItem } from "./types.js";

const ITEMS: InventoryItem[] = [
  { schemaName: "dbo", objectName: "GetA", objectClass: "procedure", tier: "simple",  definition: "" },
  { schemaName: "dbo", objectName: "GetB", objectClass: "procedure", tier: "medium",  definition: "" },
  { schemaName: "dbo", objectName: "GetC", objectClass: "procedure", tier: "complex", definition: "" },
  { schemaName: "dbo", objectName: "FnX",  objectClass: "function",  tier: "simple",  definition: "" },
  { schemaName: "dbo", objectName: "VwY",  objectClass: "view",      tier: "simple",  definition: "" },
];

describe("buildReport", () => {
  it("counts objects by class and tier correctly", () => {
    const report = buildReport(ITEMS, "TestDB");
    expect(report.database).toBe("TestDB");
    expect(report.counts.procedure.simple).toBe(1);
    expect(report.counts.procedure.medium).toBe(1);
    expect(report.counts.procedure.complex).toBe(1);
    expect(report.counts.procedure.total).toBe(3);
    expect(report.counts.function.total).toBe(1);
    expect(report.counts.view.total).toBe(1);
    expect(report.counts.trigger.total).toBe(0);
    expect(report.counts.total).toBe(5);
  });

  it("generatedAt is a valid ISO timestamp", () => {
    const report = buildReport([], "TestDB");
    expect(() => new Date(report.generatedAt)).not.toThrow();
    expect(isNaN(new Date(report.generatedAt).getTime())).toBe(false);
  });
});
