import type { ObjectClass, Tier } from "../pairs/schema.js";

export type { ObjectClass, Tier };

export interface CellEstimate {
  objectClass: ObjectClass;
  tier: Tier;
  /** Number of objects in this cell at the time of prediction (from inventory). */
  count: number;
  /** Median effort in hours per object — human judgment, must be > 0. */
  p50Hours: number;
  /** 90th-percentile effort in hours per object — must be >= p50Hours. */
  p90Hours: number;
  /** Optional free-text reasoning for the estimate. */
  note?: string;
}

export interface ExpectedFailure {
  schema: string;
  object: string;
  /** Why this object is predicted to not reach step3=pass. */
  reason: string;
}

export interface PredictionFile {
  database: string;
  version: "v1";
  /**
   * ISO timestamp set at commit time. Never edited after the first commit.
   * The commit timestamp is the proof of prediction.
   */
  committedAt: string;
  /** One sentence describing the estimating method (human-written). */
  basis: string;
  cellEstimates: CellEstimate[];
  expectedFailures: ExpectedFailure[];
}
