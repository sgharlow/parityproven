/** Single source of truth for translation-pair records.
 *  All other files (CLI, receipts builder, UI) import from here; none redefine these types.
 */

export type StepStatus = "pass" | "fail" | "not-run" | "n/a";

export type ObjectClass = "procedure" | "function" | "view" | "trigger";

export type Tier = "simple" | "medium" | "complex";

export interface ColumnMapping {
  sqlServerType: string;
  postgresType: string;
  notes?: string;
}

export interface PairRecordOrigin {
  repo: string;
  release: string;
  license: string;
  assetUrl: string;
  sha256: string;
}

export interface PairRecord {
  origin: PairRecordOrigin | "synthetic";
  conversionType: "tsql-to-plpgsql";
  objectClass: ObjectClass;
  /**
   * Complexity tier per the rules in pair-records.md:
   *  complex  — dynamic SQL, cursors, CLR, cross-db refs, linked servers, OPENQUERY/OPENROWSET, xp_
   *  medium   — temp tables/table variables, MERGE, TRY/CATCH+transactions, window functions, OUTPUT, multiple result sets
   *  simple   — everything else
   */
  tier: Tier;
  code: {
    source: string;
    engineOutput: string;
    final: string;
    diff: string;
    /** "hand-written" | "kiro:<model>:<version>" */
    engine: string;
    notes?: string[];
  };
  columnMappings: ColumnMapping[];
  evidence: {
    step1: StepStatus;
    step2: StepStatus;
    step3: StepStatus;
    step4: StepStatus;
    step5: StepStatus;
    step6: StepStatus;
    testsRun?: string[];
    rowsCompared?: number;
    trapsCovered?: string[];
    runtimeRatio?: number;
    pbtSeeds?: number[];
    harnessVersion: string;
    reviewer?: string;
    reviewDate?: string;
  };
  effort: {
    humanMinutes: number;
    engineName: string;
    engineVersion: string;
  };
  status: "pending" | "failed" | "verified";
  loadTimeFindings?: string[];
}
