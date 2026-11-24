import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import type { PairRecord } from "../pairs/schema.js";
import { buildReceipts } from "./builder.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = join(ROOT, "evidence", "review-time", "batch-minutes.json");
const readPairs = (): PairRecord[] => readdirSync(join(ROOT, "pairs")).flatMap((db) => readdirSync(join(ROOT, "pairs", db)).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(ROOT, "pairs", db, f), "utf-8")) as PairRecord));

describe("batch review minutes (ruling D3)", () => {
  const data = JSON.parse(readFileSync(FILE, "utf-8")) as { batches: Record<string, { minutes: number; recordedOn: string }> };

  it("has an entry, with whole positive minutes and a date, for every report a signed pair record cites", () => {
    const cited = [...new Set(readPairs().map((p) => p.evidence.step5Report).filter((x): x is string => !!x))].sort();
    expect(cited.length).toBeGreaterThan(0);
    expect(Object.keys(data.batches).sort()).toEqual(cited);
    for (const [report, v] of Object.entries(data.batches)) {
      expect(existsSync(join(ROOT, report)), report).toBe(true);
      expect(Number.isInteger(v.minutes) && v.minutes > 0, report).toBe(true);
      expect(v.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("reaches every signed receipt, with the same figure for the whole batch and the object count computed", () => {
    const out = buildReceipts({ pairsDir: join(ROOT, "pairs"), inventoryDir: join(ROOT, "inventory"), predictionsDir: join(ROOT, "predictions"), batchReviewMinutes: data.batches });
    const signed = out.receipts.filter((r) => r.evidence.step5Report);
    expect(signed.length).toBeGreaterThan(0);
    for (const r of signed) {
      const b = r.evidence.batchReview!;
      expect(b, `${r.schemaName}.${r.objectName}`).toBeDefined();
      expect(b.minutes).toBe(data.batches[r.evidence.step5Report!]!.minutes);
      expect(b.objectsInBatch).toBe(signed.filter((x) => x.evidence.step5Report === r.evidence.step5Report).length);
    }
  });

  it("is absent without the record, so a receipt then says the time was not recorded", () => {
    const out = buildReceipts({ pairsDir: join(ROOT, "pairs"), inventoryDir: join(ROOT, "inventory"), predictionsDir: join(ROOT, "predictions") });
    expect(out.receipts.some((r) => r.evidence.batchReview)).toBe(false);
  });
});
