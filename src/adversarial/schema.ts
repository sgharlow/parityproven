/** Types of the adversarial review: attacker file, auditor file and the evidence the CLI writes. */
import type { FixedCase } from "../harness/generic/spec.js";

export const TRAP_IDS = [
  "null-vs-empty",
  "collation-case",
  "trailing-spaces",
  "dates-datetime",
  "numeric-rounding",
  "top-ties",
  "identity-gaps",
] as const;
export type TrapId = (typeof TRAP_IDS)[number];

export interface ModelStamp {
  model: string;
  /** ISO timestamp */
  at: string;
}

export interface AdversarialCase {
  /** "A01", "A02", ... */
  id: string;
  label: string;
  traps: TrapId[];
  /** Why the engines might disagree, naming the T-SQL versus PL/pgSQL mechanism. */
  reasoning: string;
  /** Set when the case exposed a finding; such a case is never deleted. */
  regression?: boolean;
  fixedCase: FixedCase;
}

export interface AdversarialFile {
  schemaVersion: 1;
  object: string;
  database: string;
  attacker: ModelStamp;
  /** The attacker's reason a trap does not apply to this object. */
  notApplicable?: Partial<Record<TrapId, string>>;
  cases: AdversarialCase[];
}

export type ObjectionKind = "not-an-attack" | "trap-uncovered" | "label-mismatch" | "duplicate" | "weak" | "other";

export interface Objection {
  id: string;
  caseId?: string;
  kind: ObjectionKind;
  text: string;
  status: "open" | "resolved";
  resolution?: string;
  confirmedBy?: ModelStamp;
}

export interface AuditFile {
  schemaVersion: 1;
  object: string;
  database: string;
  auditor: ModelStamp;
  /** Case ids the auditor read; must equal the attacker's ids at run time. */
  casesAudited: string[];
  acceptedNotApplicable: TrapId[];
  /** Planted defects the auditor judges unobservable. */
  equivalentMutants: Array<{ name: string; reason: string }>;
  objections: Objection[];
}

export interface TrapCheck {
  present: boolean;
  detail: string;
}

export interface EngineResult {
  passed: boolean;
  message?: string;
}

export interface CaseEvidence {
  id: string;
  label: string;
  traps: TrapId[];
  reasoning: string;
  trapChecks: Partial<Record<TrapId, TrapCheck>>;
  status: "ran" | "invalid";
  invalidReason?: string;
  sqlServer?: EngineResult;
  postgres?: EngineResult;
  differed: boolean;
}

export interface TrapCoverage {
  applicable: boolean;
  coveredBy: string[];
  notApplicableReason?: string;
  accepted?: boolean;
}

export type AdequacyVerdict = "adequate" | "inadequate" | "no-mutants";

export interface MutantAdequacy {
  verdict: AdequacyVerdict;
  caught: string[];
  /** Every missed planted defect, including those recorded as equivalent. */
  missed: string[];
  skipped: string[];
  /** Missed planted defects the auditor judged unobservable (a subset of `missed`). */
  equivalentRecorded: string[];
}

export interface FileStamp extends ModelStamp {
  file: string;
  sha256: string;
}

export interface AdversarialEvidence {
  schemaVersion: 1;
  object: string;
  database: string;
  runAt: string;
  harnessVersion: string;
  /** sha256 of the pair record's code.final at run time. */
  conversionSha256: string;
  attacker: FileStamp;
  auditor: FileStamp;
  sameModel: boolean;
  casesAudited: string[];
  traps: Record<TrapId, TrapCoverage>;
  cases: CaseEvidence[];
  summary: { ran: number; differed: number; invalid: number };
  objections: Objection[];
  mutantAdequacy: MutantAdequacy;
  gate: { passed: boolean; reasons: string[] };
  /** "N adversarial cases ran, M differed" */
  wording: string;
}
