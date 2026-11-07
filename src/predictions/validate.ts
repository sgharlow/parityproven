import type { PredictionFile, CellEstimate } from "./schema.js";
import type { InventoryReport } from "../inventory/types.js";
import type { ObjectClass, Tier } from "../pairs/schema.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validatePredictions(
  pred: PredictionFile,
  report: InventoryReport
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Index inventory cells
  type CellKey = string;
  const inventoryCells = new Map<CellKey, number>();
  const inventoryObjects = new Set<string>();

  for (const obj of report.objects) {
    const key = cellKey(obj.objectClass, obj.tier);
    inventoryCells.set(key, (inventoryCells.get(key) ?? 0) + 1);
    inventoryObjects.add(`${obj.schemaName}.${obj.objectName}`);
  }

  // Index prediction cells
  const predCells = new Map<CellKey, CellEstimate>();
  for (const est of pred.cellEstimates) {
    predCells.set(cellKey(est.objectClass, est.tier), est);
  }

  // 1. Missing cells (inventory has them, predictions don't)
  for (const [key, count] of inventoryCells) {
    if (!predCells.has(key)) {
      errors.push(`Missing estimate for cell ${key} (${count} objects in inventory)`);
    }
  }

  // 2. Extra cells (predictions have them, inventory doesn't)
  for (const [key] of predCells) {
    if (!inventoryCells.has(key)) {
      warnings.push(`Extra cell in predictions: ${key} — no objects in inventory`);
    }
  }

  // 3. Per-cell value checks
  for (const est of pred.cellEstimates) {
    const key = cellKey(est.objectClass, est.tier);
    if (!(est.p50Hours > 0)) {
      errors.push(`Cell ${key}: p50Hours must be > 0 (got ${est.p50Hours})`);
    }
    if (!(est.p90Hours >= est.p50Hours)) {
      errors.push(`Cell ${key}: p90Hours (${est.p90Hours}) must be >= p50Hours (${est.p50Hours})`);
    }
    // Warn if count doesn't match inventory
    const liveCount = inventoryCells.get(key) ?? 0;
    if (est.count !== liveCount) {
      warnings.push(`Cell ${key}: predicted count ${est.count} differs from live inventory ${liveCount}`);
    }
  }

  // 4. Expected failures — each must exist in the inventory
  for (const ef of pred.expectedFailures) {
    const fullName = `${ef.schema}.${ef.object}`;
    if (!inventoryObjects.has(fullName)) {
      errors.push(`Expected failure "${fullName}" not found in inventory`);
    }
  }

  // 5. Metadata checks
  if (!pred.committedAt || pred.committedAt.trim() === "") {
    errors.push(`committedAt is empty — set it to the ISO timestamp before committing`);
  }
  if (!pred.basis || pred.basis.trim() === "") {
    errors.push(`basis is empty — write one sentence describing your estimating method`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function cellKey(objectClass: ObjectClass, tier: Tier): string {
  return `${objectClass}/${tier}`;
}
