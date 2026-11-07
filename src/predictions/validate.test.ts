import { describe, it, expect } from "vitest";
import { validatePredictions } from "./validate.js";
import type { PredictionFile } from "./schema.js";
import type { InventoryReport } from "../inventory/types.js";

const BASE_REPORT: InventoryReport = {
  database: "TestDB",
  generatedAt: "2026-11-07T00:00:00.000Z",
  counts: {
    procedure: { simple: 2, medium: 1, complex: 0, total: 3 },
    function:  { simple: 0, medium: 0, complex: 0, total: 0 },
    view:      { simple: 0, medium: 0, complex: 0, total: 0 },
    trigger:   { simple: 0, medium: 0, complex: 0, total: 0 },
    total: 3,
  },
  objects: [
    { schemaName: "dbo", objectName: "GetA", objectClass: "procedure", tier: "simple",  definition: "" },
    { schemaName: "dbo", objectName: "GetB", objectClass: "procedure", tier: "simple",  definition: "" },
    { schemaName: "dbo", objectName: "GetC", objectClass: "procedure", tier: "medium",  definition: "" },
  ],
};

const VALID_PRED: PredictionFile = {
  database: "TestDB",
  version: "v1",
  committedAt: "2026-11-07T10:00:00.000Z",
  basis: "Judgment based on experience.",
  cellEstimates: [
    { objectClass: "procedure", tier: "simple", count: 2, p50Hours: 1.0, p90Hours: 2.0 },
    { objectClass: "procedure", tier: "medium", count: 1, p50Hours: 2.0, p90Hours: 4.0 },
  ],
  expectedFailures: [
    { schema: "dbo", object: "GetC", reason: "Uses temp tables" },
  ],
};

describe("validatePredictions", () => {
  it("valid file passes with no errors", () => {
    const r = validatePredictions(VALID_PRED, BASE_REPORT);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("missing cell produces an error", () => {
    const pred: PredictionFile = {
      ...VALID_PRED,
      cellEstimates: [
        { objectClass: "procedure", tier: "simple", count: 2, p50Hours: 1.0, p90Hours: 2.0 },
        // procedure/medium is missing
      ],
    };
    const r = validatePredictions(pred, BASE_REPORT);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("procedure/medium"))).toBe(true);
  });

  it("p50Hours = 0 produces an error", () => {
    const pred: PredictionFile = {
      ...VALID_PRED,
      cellEstimates: [
        { objectClass: "procedure", tier: "simple", count: 2, p50Hours: 0, p90Hours: 2.0 },
        { objectClass: "procedure", tier: "medium", count: 1, p50Hours: 2.0, p90Hours: 4.0 },
      ],
    };
    const r = validatePredictions(pred, BASE_REPORT);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("p50Hours must be > 0"))).toBe(true);
  });

  it("p90 < p50 produces an error", () => {
    const pred: PredictionFile = {
      ...VALID_PRED,
      cellEstimates: [
        { objectClass: "procedure", tier: "simple", count: 2, p50Hours: 3.0, p90Hours: 1.0 },
        { objectClass: "procedure", tier: "medium", count: 1, p50Hours: 2.0, p90Hours: 4.0 },
      ],
    };
    const r = validatePredictions(pred, BASE_REPORT);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("p90Hours"))).toBe(true);
  });

  it("unknown expected-failure object produces an error", () => {
    const pred: PredictionFile = {
      ...VALID_PRED,
      expectedFailures: [
        { schema: "dbo", object: "DoesNotExist", reason: "test" },
      ],
    };
    const r = validatePredictions(pred, BASE_REPORT);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("DoesNotExist"))).toBe(true);
  });

  it("extra cell in predictions produces a warning, not an error", () => {
    const pred: PredictionFile = {
      ...VALID_PRED,
      cellEstimates: [
        ...VALID_PRED.cellEstimates,
        { objectClass: "function", tier: "complex", count: 0, p50Hours: 4.0, p90Hours: 8.0 },
      ],
    };
    const r = validatePredictions(pred, BASE_REPORT);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.includes("function/complex"))).toBe(true);
  });

  it("empty committedAt produces an error", () => {
    const pred: PredictionFile = { ...VALID_PRED, committedAt: "" };
    const r = validatePredictions(pred, BASE_REPORT);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("committedAt"))).toBe(true);
  });

  it("empty basis produces an error", () => {
    const pred: PredictionFile = { ...VALID_PRED, basis: "" };
    const r = validatePredictions(pred, BASE_REPORT);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("basis"))).toBe(true);
  });
});
