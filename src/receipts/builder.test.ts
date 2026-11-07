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

    const r = output.receipts[0];
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
