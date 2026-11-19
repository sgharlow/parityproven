/** Builds the adversarial evidence of one object from the engines' results. Pure: no database, no clock except `runAt`. */
import { adequacyVerdict, gateResult } from "./gate.js";
import { applicableTraps, checkTrap } from "./traps.js";
import { TRAP_IDS, type AdversarialEvidence, type AdversarialFile, type AuditFile, type CaseEvidence, type TrapCheck, type TrapCoverage, type TrapId } from "./schema.js";
import type { ObjectSpec } from "../harness/generic/spec.js";
import type { Outcome } from "../agreed/runner.js";

export interface EvidenceInput {
  spec: ObjectSpec;
  cases: AdversarialFile;
  casesFile: { path: string; sha256: string };
  audit: AuditFile;
  auditFile: { path: string; sha256: string };
  /** sha256 of the pair record's code.final (the conversion the cases ran against). */
  finalSha256: string;
  outcome: Outcome;
  harnessVersion: string;
  runAt: string;
}

export const wordingOf = (ran: number, differed: number): string =>
  `${ran} adversarial case${ran === 1 ? "" : "s"} ran, ${differed} differed`;

export function buildEvidence(i: EvidenceInput): AdversarialEvidence {
  const invalidBy = new Map((i.outcome.invalid ?? []).map((x) => [x.index, x.reason]));
  const cases: CaseEvidence[] = i.cases.cases.map((c, index) => {
    const trapChecks: Partial<Record<TrapId, TrapCheck>> = {};
    for (const t of c.traps) trapChecks[t] = checkTrap(t, i.spec, c.fixedCase);
    const base = { id: c.id, label: c.label, traps: c.traps, reasoning: c.reasoning, trapChecks };
    const reason = invalidBy.get(index);
    if (reason !== undefined) return { ...base, status: "invalid", invalidReason: reason, differed: false };
    const result = (engine: "SQL Server" | "PostgreSQL") => {
      const t = i.outcome.tests.find((x) => x.caseIndex === index && x.engine === engine);
      return t ? { passed: t.passed, ...(t.message ? { message: t.message } : {}) } : undefined;
    };
    const sqlServer = result("SQL Server");
    const postgres = result("PostgreSQL");
    return { ...base, status: "ran", ...(sqlServer ? { sqlServer } : {}), ...(postgres ? { postgres } : {}), differed: !(sqlServer?.passed && postgres?.passed) };
  });

  const applicable = applicableTraps(i.spec);
  const traps = {} as Record<TrapId, TrapCoverage>;
  for (const t of TRAP_IDS) {
    const reason = i.cases.notApplicable?.[t];
    traps[t] = {
      applicable: applicable[t].applicable,
      coveredBy: cases.filter((c) => c.traps.includes(t) && c.trapChecks[t]?.present === true).map((c) => c.id),
      ...(reason !== undefined ? { notApplicableReason: reason, accepted: i.audit.acceptedNotApplicable.includes(t) } : {}),
    };
  }

  const equivalent = new Set(i.audit.equivalentMutants.map((m) => m.name));
  const caught = [...i.outcome.defects.caught];
  const missed = [...i.outcome.defects.missed];
  const equivalentRecorded = missed.filter((m) => equivalent.has(m));
  const mutantAdequacy = { verdict: adequacyVerdict({ caught, missed, equivalentRecorded }), caught, missed, skipped: [...i.outcome.defects.skipped], equivalentRecorded };

  const summary = {
    ran: cases.filter((c) => c.status === "ran").length,
    differed: cases.filter((c) => c.differed).length,
    invalid: cases.filter((c) => c.status === "invalid").length,
  };
  const ev: AdversarialEvidence = {
    schemaVersion: 1,
    object: i.cases.object,
    database: i.cases.database,
    runAt: i.runAt,
    harnessVersion: i.harnessVersion,
    conversionSha256: i.finalSha256,
    attacker: { ...i.cases.attacker, file: i.casesFile.path, sha256: i.casesFile.sha256 },
    auditor: { ...i.audit.auditor, file: i.auditFile.path, sha256: i.auditFile.sha256 },
    sameModel: i.cases.attacker.model === i.audit.auditor.model,
    casesAudited: [...i.audit.casesAudited],
    traps,
    cases,
    summary,
    objections: i.audit.objections,
    mutantAdequacy,
    gate: { passed: false, reasons: [] },
    wording: wordingOf(summary.ran, summary.differed),
  };
  ev.gate = gateResult(ev, i.finalSha256);
  return ev;
}
