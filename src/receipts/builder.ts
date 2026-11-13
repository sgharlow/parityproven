import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { PairRecord } from "../pairs/schema.js";
import type { InventoryReport } from "../inventory/types.js";
import type { PredictionFile } from "../predictions/schema.js";
import type { ReceiptExclusion, ReceiptFile, ReceiptIndex, ReceiptIndexEntry } from "./schema.js";
import { STEP_LABELS } from "./schema.js";
import { classifyTierAtPrediction } from "../inventory/tier.js";

export interface BuildInput {
  pairsDir: string;       // e.g. repo/pairs
  inventoryDir: string;   // e.g. repo/inventory
  predictionsDir: string; // e.g. repo/predictions
  /** Out-of-scope objects, listed on the scorecard with their reason (src/conversions/dispositions.ts). */
  exclusions?: BuildExclusion[];
  /** In-scope objects with no conversion attempt, listed with what they would need (src/conversions/dispositions.ts). */
  notAttempted?: BuildExclusion[];
}

export interface BuildExclusion {
  database: string;
  schemaName: string;
  objectName: string;
  reason: string;
}

export interface BuildOutput {
  receipts: ReceiptFile[];
  index: ReceiptIndex;
}

export function buildReceipts(input: BuildInput): BuildOutput {
  const receipts: ReceiptFile[] = [];

  // Load all pair records
  const databases = existsSync(input.pairsDir)
    ? readdirSync(input.pairsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];

  for (const database of databases) {
    const dbPairsDir = join(input.pairsDir, database);
    const pairFiles = readdirSync(dbPairsDir).filter((f) => f.endsWith(".json"));

    // Load inventory for this database
    const inventoryPath = join(input.inventoryDir, `${database}.json`);
    const inventory: InventoryReport | null = existsSync(inventoryPath)
      ? (JSON.parse(readFileSync(inventoryPath, "utf-8")) as InventoryReport)
      : null;

    // Load predictions for this database
    const predPath = join(input.predictionsDir, `${database}-v1.json`);
    const predictions: PredictionFile | null = existsSync(predPath)
      ? (JSON.parse(readFileSync(predPath, "utf-8")) as PredictionFile)
      : null;

    for (const pairFile of pairFiles) {
      const pair = JSON.parse(
        readFileSync(join(dbPairsDir, pairFile), "utf-8")
      ) as PairRecord;

      // Derive schema/object name from file name: "Schema.ObjectName.json"
      const baseName = pairFile.replace(/\.json$/, "");
      const dotIdx = baseName.indexOf(".");
      const schemaName = dotIdx > -1 ? baseName.slice(0, dotIdx) : "dbo";
      const objectName = dotIdx > -1 ? baseName.slice(dotIdx + 1) : baseName;

      // Find matching inventory item
      const invItem = inventory?.objects.find(
        (o) => o.schemaName === schemaName && o.objectName === objectName
      ) ?? null;

      // The prediction cell is the one the object was predicted in: tier rules as of the v1 predictions (tier.ts)
      const predictionTier = classifyTierAtPrediction(invItem?.definition ?? pair.code.source);
      const predCell = predictions?.cellEstimates.find(
        (c) => c.objectClass === pair.objectClass && c.tier === predictionTier
      ) ?? null;

      // Build verification steps
      const evidence = pair.evidence;
      const verificationSteps = [1, 2, 3, 4, 5, 6].map((n) => ({
        step: n,
        label: STEP_LABELS[n] ?? `Step ${n}`,
        status: evidence[`step${n}` as keyof typeof evidence] as import("../pairs/schema.js").StepStatus,
      }));

      const receipt: ReceiptFile = {
        database,
        schemaName,
        objectName,
        objectClass: invItem?.objectClass ?? pair.objectClass,
        tier: invItem?.tier ?? pair.tier,
        predictionTier,
        status: pair.status,
        code: pair.code,
        columnMappings: pair.columnMappings,
        verificationSteps,
        evidence: {
          pbtSeeds: evidence.pbtSeeds,
          rowsCompared: evidence.rowsCompared,
          samples: evidence.samples,
          samplesWithRows: evidence.samplesWithRows,
          trapsCovered: evidence.trapsCovered,
          mutantsDetected: evidence.mutantsDetected,
          failureDetail: evidence.failureDetail,
          runtime: evidence.runtime,
          engineOutputCheck: evidence.engineOutputCheck,
          subMicrosecondNormalised: evidence.subMicrosecondNormalised,
          loadTimeFindings: pair.loadTimeFindings,
          harnessVersion: evidence.harnessVersion,
          testsRun: evidence.testsRun,
          reviewer: evidence.reviewer,
          reviewDate: evidence.reviewDate,
        },
        effort: pair.effort,
        predictionCell: predCell
          ? { p50Hours: predCell.p50Hours, p90Hours: predCell.p90Hours }
          : null,
        builtAt: new Date().toISOString(),
      };

      receipts.push(receipt);
    }
  }

  // Build index
  const indexEntries: ReceiptIndexEntry[] = receipts.map((r) => ({
    database: r.database,
    schemaName: r.schemaName,
    objectName: r.objectName,
    objectClass: r.objectClass,
    tier: r.tier,
    status: r.status,
    path: `${r.database}/${r.schemaName}.${r.objectName}.json`,
  }));

  // Exclusions: tier and class come from the inventory, so they are never typed by hand
  const excluded: ReceiptExclusion[] = (input.exclusions ?? []).map((x) => {
    const invPath = join(input.inventoryDir, `${x.database}.json`);
    if (!existsSync(invPath)) {
      throw new Error(`inventory/${x.database}.json is missing (inventories are generated, not committed): run  npm run inventory -- --database ${x.database}`);
    }
    const inv = JSON.parse(readFileSync(invPath, "utf-8")) as InventoryReport;
    const item = inv.objects.find((o) => o.schemaName === x.schemaName && o.objectName === x.objectName);
    if (!item) throw new Error(`excluded object ${x.database}.${x.schemaName}.${x.objectName} is not in the inventory`);
    if (receipts.some((r) => r.database === x.database && r.schemaName === x.schemaName && r.objectName === x.objectName)) {
      throw new Error(`${x.schemaName}.${x.objectName} is both excluded and has a pair record`);
    }
    return { database: x.database, schemaName: x.schemaName, objectName: x.objectName, objectClass: item.objectClass, tier: item.tier, reason: x.reason };
  });

  // Not attempted: every inventoried object without a pair record or an exclusion is listed, never silently missing.
  const listed = new Set([...receipts, ...excluded].map((r) => `${r.database}/${r.schemaName}.${r.objectName}`));
  const declared = new Map((input.notAttempted ?? []).map((x) => [`${x.database}/${x.schemaName}.${x.objectName}`, x.reason]));
  const notAttempted: ReceiptExclusion[] = [];
  const tierNotes: string[] = [];
  const inventoryTotals: Record<string, number> = {};
  for (const database of inventoryDatabases(input)) {
    const inv = JSON.parse(readFileSync(join(input.inventoryDir, `${database}.json`), "utf-8")) as InventoryReport & { tierRuleChanges?: string[] };
    inventoryTotals[database] = inv.objects.length;
    for (const o of inv.objects) {
      const key = `${database}/${o.schemaName}.${o.objectName}`;
      if (listed.has(key)) continue;
      notAttempted.push({
        database, schemaName: o.schemaName, objectName: o.objectName, objectClass: o.objectClass, tier: o.tier,
        reason: declared.get(key) ?? "Not attempted; no reason recorded yet.",
      });
    }
    // tier rules changed after the v1 predictions: say so, with the count measured here
    const moved = inv.objects.filter((o) => classifyTierAtPrediction(o.definition) !== o.tier).length;
    if (moved > 0) {
      tierNotes.push(
        `${database}: the tier rules changed after the v1 predictions were committed; ${moved} of ${inv.objects.length} objects now sit in a different tier. ` +
        "Each receipt shows its current tier, and is scored against the prediction cell it was predicted in. The predictions are not edited." +
        (inv.tierRuleChanges?.length ? ` Change: ${inv.tierRuleChanges.join(" ")}` : "")
      );
    }
  }
  for (const key of declared.keys()) {
    if (listed.has(key)) throw new Error(`${key} is marked not-attempted but has a pair record or an exclusion`);
  }

  const summary = {
    total: receipts.length,
    verified: receipts.filter((r) => r.status === "verified").length,
    pending: receipts.filter((r) => r.status === "pending").length,
    failed: receipts.filter((r) => r.status === "failed").length,
    excluded: excluded.length,
    notAttempted: notAttempted.length,
    inventory: Object.values(inventoryTotals).reduce((a, b) => a + b, 0),
  };

  const index: ReceiptIndex = {
    builtAt: new Date().toISOString(),
    receipts: indexEntries,
    excluded,
    notAttempted,
    tierNotes,
    // the committed v1 predictions, so the questionnaire's rates and the site's counts are never typed by hand
    predictions: Object.fromEntries(
      inventoryDatabases(input).flatMap((database) => {
        const p = join(input.predictionsDir, `${database}-v1.json`);
        if (!existsSync(p)) return [];
        const pred = JSON.parse(readFileSync(p, "utf-8")) as PredictionFile;
        return [[database, {
          committedAt: pred.committedAt,
          cells: pred.cellEstimates.map((c) => ({ objectClass: c.objectClass, tier: c.tier, count: c.count, p50Hours: c.p50Hours, p90Hours: c.p90Hours })),
        }]];
      })
    ),
    inventory: inventoryTotals,
    summary,
  };

  return { receipts, index };
}

/** Databases with an inventory file (the scorecard's denominator). */
function inventoryDatabases(input: BuildInput): string[] {
  if (!existsSync(input.inventoryDir)) return [];
  return readdirSync(input.inventoryDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
}
