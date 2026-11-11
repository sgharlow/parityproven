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
  /** Objects that failed although they were not predicted to. Shown, never filtered out. */
  unpredictedFailures?: Array<{ object: string; detail: string }>;
}

export function scorePredictions(
  pred: PredictionFile,
  pairs: PairRecord[],
  /** "Schema.Object" for each pair, same order (from the pair file names). */
  names?: string[]
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

  // match on the pair's own name (pairs/<db>/<Schema>.<Object>.json); fall back to the T-SQL text
  const nameOf = (p: PairRecord, i: number): string => names?.[i] ?? "";
  const findPair = (schema: string, object: string): PairRecord | undefined => {
    const byName = pairs.findIndex((p, i) => nameOf(p, i) === `${schema}.${object}`);
    if (byName >= 0) return pairs[byName];
    return pairs.find((p) => p.code.source.includes(`${schema}.${object}`) || p.code.source.includes(`[${schema}].[${object}]`));
  };

  const failurePredictions: FailurePredictionScore[] = pred.expectedFailures.map((ef) => {
    const matchingPair = findPair(ef.schema, ef.object);
    const confirmed: boolean | null = matchingPair ? matchingPair.status === "failed" : null;
    return { schema: ef.schema, object: ef.object, reason: ef.reason, confirmed };
  });

  // outcomes nobody predicted: failures that were not on the expected-failure list
  const expected = new Set(pred.expectedFailures.map((ef) => `${ef.schema}.${ef.object}`));
  const unpredictedFailures = pairs
    .map((p, i) => ({ p, name: nameOf(p, i) }))
    .filter(({ p, name }) => p.status === "failed" && name && !expected.has(name))
    .map(({ p, name }) => ({ object: name, detail: p.evidence.failureDetail ?? "" }));

  return { database: pred.database, cells, failurePredictions, unpredictedFailures };
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
  const passedInstead = result.failurePredictions.filter((f) => f.confirmed === false).length;
  const surprises = result.unpredictedFailures ?? [];
  const failureLine =
    `Expected failures: ${predicted} predicted, ${confirmed} confirmed, ${passedInstead} did not fail, ${notRun} not-yet-run` +
    `\nUnpredicted failures: ${surprises.length}${surprises.length ? "\n" + surprises.map((s) => `  - ${s.object}: ${s.detail}`).join("\n") : ""}`;

  return [header, HR, headerRow, HR, ...dataRows, HR, failureLine].join("\n");
}
