import { describe, it, expect } from "vitest";
import { buildReceipts } from "./builder.js";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

describe("buildReceipts", () => {
  it("builds receipts from the real pairs directory", () => {
    const output = buildReceipts({
      pairsDir: resolve(REPO_ROOT, "pairs"),
      inventoryDir: resolve(REPO_ROOT, "inventory"),
      predictionsDir: resolve(REPO_ROOT, "predictions"),
    });

    // At least one receipt (Integration.GetMovementUpdates)
    expect(output.receipts.length).toBeGreaterThanOrEqual(1);

    const r = output.receipts.find((x) => x.objectName === "GetMovementUpdates")!;
    expect(r).toBeDefined();
    expect(r.database).toBe("WideWorldImporters");
    expect(r.objectName).toBe("GetMovementUpdates");
    expect(r.schemaName).toBe("Integration");
    expect(r.status).toBe("pending");
    expect(r.verificationSteps).toHaveLength(6);
    expect(r.verificationSteps[2].status).toBe("pass");   // step3
    expect(r.verificationSteps[2].label).toContain("Result sets match");

    // predictionCell is not null — predictions file exists with 0 values (unfilled template)
    // It will have p50Hours=0 until Steve fills it in
    expect(r.predictionCell).toBeDefined();
  });

  it("index summary counts match receipts", () => {
    const output = buildReceipts({
      pairsDir: resolve(REPO_ROOT, "pairs"),
      inventoryDir: resolve(REPO_ROOT, "inventory"),
      predictionsDir: resolve(REPO_ROOT, "predictions"),
    });

    const { summary, receipts } = output.index;
    expect(summary.total).toBe(receipts.length);
    expect(summary.verified + summary.pending + summary.failed).toBe(summary.total);
  });

  it("missing predictions directory → predictionCell is null", () => {
    const output = buildReceipts({
      pairsDir: resolve(REPO_ROOT, "pairs"),
      inventoryDir: resolve(REPO_ROOT, "inventory"),
      predictionsDir: "/nonexistent/path",
    });
    for (const r of output.receipts) {
      expect(r.predictionCell).toBeNull();
    }
  });
});

describe("predictionNotes", () => {
  const base = {
    pairsDir: resolve(REPO_ROOT, "pairs"),
    inventoryDir: resolve(REPO_ROOT, "inventory"),
    predictionsDir: resolve(REPO_ROOT, "predictions"),
  };

  it("discloses an object first committed before its database's predictions, and only that one", () => {
    const output = buildReceipts({
      ...base,
      firstCommits: {
        "WideWorldImporters/Integration.GetMovementUpdates": { at: "2026-11-07T06:16:59.000Z", commit: "c2bb74f" },
        "WideWorldImporters/Website.ChangePassword": { at: "2026-11-10T00:00:00.000Z", commit: "later01" },
        "AdventureWorks2025/Sales.vSalesPerson": { at: "2026-11-11T00:00:00.000Z", commit: "later02" },
      },
    });
    const notes = output.index.predictionNotes ?? [];
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("WideWorldImporters: 1 object was converted before the v1 predictions were committed");
    expect(notes[0]).toContain("Integration.GetMovementUpdates (first committed 2026-11-07T06:16:59.000Z in c2bb74f)");
    expect(notes[0]).not.toContain("ChangePassword");
  });

  it("writes no note when every object came after the predictions", () => {
    const output = buildReceipts({
      ...base,
      firstCommits: { "WideWorldImporters/Website.ChangePassword": { at: "2026-11-10T00:00:00.000Z", commit: "later01" } },
    });
    expect(output.index.predictionNotes).toEqual([]);
  });
});
