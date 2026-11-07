import type { PredictionFile } from "./schema.js";
import type { PairRecord, ObjectClass, Tier } from "../pairs/schema.js";

export interface CellScore {
  objectClass: ObjectClass;
  tier: Tier;
  p50Hours: number;
  p90Hours: number;
  count: number;
  verified: number;
  pending: number;
  failed: number;
  actualAvgMinutes: number | null;  // null when no completed pairs yet
}

export interface FailurePredictionScore {
  schema: string;
  object: string;
  reason: string;
  confirmed: boolean | null;  // null = not yet run
}

export interface ScoreResult {
  database: string;
  cells: CellScore[];
  failurePredictions: FailurePredictionScore[];
}

export function scorePredictions(
  pred: PredictionFile,
  pairs: PairRecord[]
): ScoreResult {
  type CellKey = string;
  const pairsByCell = new Map<CellKey, PairRecord[]>();

  for (const pair of pairs) {
    const key = `${pair.objectClass}/${pair.tier}`;
    const existing = pairsByCell.get(key) ?? [];
    existing.push(pair);
    pairsByCell.set(key, existing);
  }

  const cells: CellScore[] = pred.cellEstimates.map((est) => {
    const key = `${est.objectClass}/${est.tier}`;
    const cellPairs = pairsByCell.get(key) ?? [];

    const verified = cellPairs.filter((p) => p.status === "verified").length;
    const failed   = cellPairs.filter((p) => p.status === "failed").length;
    const pending  = cellPairs.filter((p) => p.status === "pending").length;

    const completedMinutes = cellPairs
      .filter((p) => p.status === "verified" || p.status === "failed")
      .map((p) => p.effort.humanMinutes)
      .filter((m) => m > 0);

    const actualAvgMinutes =
      completedMinutes.length > 0
        ? completedMinutes.reduce((a, b) => a + b, 0) / completedMinutes.length
        : null;

    return {
      objectClass: est.objectClass,
      tier: est.tier,
      p50Hours: est.p50Hours,
      p90Hours: est.p90Hours,
      count: est.count,
      verified,
      pending,
      failed,
      actualAvgMinutes,
    };
  });

  const failurePredictions: FailurePredictionScore[] = pred.expectedFailures.map((ef) => {
    const matchingPair = pairs.find(
      (p) =>
        // pair records don't store schema/object separately — match by searching code.source
        // or by checking the pair file name convention: pairs/<db>/<schema>.<object>.json
        // For now match by checking if any pair's source contains the object name
        p.code.source.includes(`${ef.schema}.${ef.object}`) ||
        p.code.source.includes(`[${ef.schema}].[${ef.object}]`)
    );

    let confirmed: boolean | null = null;
    if (matchingPair) {
      confirmed = matchingPair.status === "failed";
    }

    return { schema: ef.schema, object: ef.object, reason: ef.reason, confirmed };
  });

  return { database: pred.database, cells, failurePredictions };
}

/** Format a score table for stdout. */
export function formatScoreTable(result: ScoreResult): string {
  const HR = "─".repeat(72);
  const pad = (s: string | number, w: number, right = false) =>
    right ? String(s).padStart(w) : String(s).padEnd(w);

  const header = `${result.database} — predicted vs actual`;
  const colLabels = ["Cell", "P50h", "P90h", "Actual avg", "Objects", "Verified", "Pending", "Failed"];
  const widths    = [22,      5,     5,      11,            8,         9,          8,         7];

  const headerRow = colLabels.map((l, i) => pad(l, widths[i], i > 0)).join(" ");

  const dataRows = result.cells.map((c) => {
    const actual = c.actualAvgMinutes !== null
      ? `${(c.actualAvgMinutes / 60).toFixed(1)}h`
      : "—";
    return [
      `${c.objectClass}/${c.tier}`,
      c.p50Hours.toFixed(1),
      c.p90Hours.toFixed(1),
      actual,
      c.count,
      c.verified,
      c.pending,
      c.failed,
    ].map((v, i) => pad(v, widths[i], i > 0)).join(" ");
  });

  const predicted = result.failurePredictions.length;
  const confirmed = result.failurePredictions.filter((f) => f.confirmed === true).length;
  const notRun    = result.failurePredictions.filter((f) => f.confirmed === null).length;
  const failureLine = `Expected failures: ${predicted} predicted, ${confirmed} confirmed, ${notRun} not-yet-run`;

  return [header, HR, headerRow, HR, ...dataRows, HR, failureLine].join("\n");
}
