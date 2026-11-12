import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { PairRecord } from "../pairs/schema.js";
import type { InventoryReport } from "../inventory/types.js";
import type { PredictionFile } from "../predictions/schema.js";
import type { ReceiptExclusion, ReceiptFile, ReceiptIndex, ReceiptIndexEntry } from "./schema.js";
import { STEP_LABELS } from "./schema.js";

export interface BuildInput {
  pairsDir: string;       // e.g. repo/pairs
  inventoryDir: string;   // e.g. repo/inventory
  predictionsDir: string; // e.g. repo/predictions
  /** Out-of-scope objects, listed on the scorecard with their reason (src/conversions/dispositions.ts). */
  exclusions?: BuildExclusion[];
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

      // Find matching prediction cell
      const predCell = predictions?.cellEstimates.find(
        (c) => c.objectClass === pair.objectClass && c.tier === pair.tier
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

  const summary = {
    total: receipts.length,
    verified: receipts.filter((r) => r.status === "verified").length,
    pending: receipts.filter((r) => r.status === "pending").length,
    failed: receipts.filter((r) => r.status === "failed").length,
    excluded: excluded.length,
  };

  const index: ReceiptIndex = {
    builtAt: new Date().toISOString(),
    receipts: indexEntries,
    excluded,
    summary,
  };

  return { receipts, index };
}
