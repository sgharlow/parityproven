import type { ObjectClass, Tier, StepStatus } from "../pairs/schema.js";
export type { ObjectClass, Tier, StepStatus };

export interface VerificationStep {
  step: number;
  label: string;
  status: StepStatus;
}

export interface ReceiptFile {
  database: string;
  schemaName: string;
  objectName: string;
  objectClass: ObjectClass;
  tier: Tier;
  /** The tier under the rules the v1 predictions were made with; the prediction cell is matched on this. */
  predictionTier?: Tier;
  status: "pending" | "failed" | "verified";
  code: {
    source: string;
    engineOutput: string;
    final: string;
    diff: string;
    engine: string;
    notes?: string[];
  };
  columnMappings?: Array<{ sqlServerType: string; postgresType: string; notes?: string }>;
  verificationSteps: VerificationStep[];
  evidence: {
    pbtSeeds?: number[];
    rowsCompared?: number;
    samples?: number;
    samplesWithRows?: number;
    trapsCovered?: string[];
    mutantsDetected?: string[];
    failureDetail?: string;
    runtime?: {
      volume: number; timedRuns: number; sqlServerMs: number; postgresMs: number; ratio: number;
      threshold: number; belowResolution?: boolean; resultRows: number; volumeMismatch: string | null;
    };
    engineOutputCheck?: { step3: StepStatus; seed: number; detail?: string };
    subMicrosecondNormalised?: number;
    loadTimeFindings?: string[];
    harnessVersion: string;
    /** Step 2: the agreed tests that ran on each engine. */
    testsRun?: string[];
    /** Step 5: the second review. */
    reviewer?: string;
    reviewDate?: string;
  };
  effort: { humanMinutes: number; engineName: string; engineVersion: string };
  predictionCell: { p50Hours: number; p90Hours: number } | null;
  builtAt: string;
}

export interface ReceiptIndexEntry {
  database: string;
  schemaName: string;
  objectName: string;
  objectClass: ObjectClass;
  tier: Tier;
  status: "pending" | "failed" | "verified";
  path: string;
}

/** An inventory object that is out of scope: not converted, not a pair record, shown with its reason. */
export interface ReceiptExclusion {
  database: string;
  schemaName: string;
  objectName: string;
  objectClass: ObjectClass;
  tier: Tier;
  reason: string;
}

export interface ReceiptIndex {
  builtAt: string;
  receipts: ReceiptIndexEntry[];
  excluded?: ReceiptExclusion[];
  /** In-scope inventory objects with no conversion attempt (and the reason). With receipts and excluded, covers the inventory. */
  notAttempted?: ReceiptExclusion[];
  /** Measured notes on tier rules that changed after the predictions. */
  tierNotes?: string[];
  /** Objects whose conversion was committed before their database's predictions (computed from git history). */
  predictionNotes?: string[];
  /** The committed v1 prediction cells per database (read by the questionnaire). */
  predictions?: Record<string, { committedAt: string; cells: Array<{ objectClass: ObjectClass; tier: Tier; count: number; p50Hours: number; p90Hours: number }> }>;
  /** Inventoried objects per database. */
  inventory?: Record<string, number>;
  summary: { total: number; verified: number; pending: number; failed: number; excluded?: number; notAttempted?: number; inventory?: number };
}

export const STEP_LABELS: Record<number, string> = {
  1: "Compiles and deploys on PostgreSQL",
  2: "Agreed tests pass (tSQLt on SQL Server, plain-SQL assertions on PostgreSQL)",
  3: "Result sets match on generated data",
  4: "Runtime within 1.5× factor",
  5: "Second human review",
  6: "Acceptance on real data",
};
