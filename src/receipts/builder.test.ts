import { describe, it, expect } from "vitest";
import { buildReceipts } from "./builder.js";
import { computeStatus } from "../pairs/status.js";
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
    // the receipt's status is the status rule applied to the record's steps (the record's status itself is data: it
    // changes with reviews, e.g. reset on 2026-11-18 when this object's agreed tests were strengthened)
    expect(r.verificationSteps).toHaveLength(6);
    const steps = r.verificationSteps.map((s) => s.status);
    expect(r.status).toBe(computeStatus({ step1: steps[0], step2: steps[1], step3: steps[2], step4: steps[3], step5: steps[4], step6: steps[5] } as never));
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
