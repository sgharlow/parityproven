/**
 * The adversarial gate (ruling A1). Pure: it reads engine results, trap checks and recorded objections, and never an
 * agent's opinion of pass or fail.
 */
import { TRAP_IDS, type AdequacyVerdict, type AdversarialEvidence, type MutantAdequacy } from "./schema.js";

/** adequate: every planted defect was caught or recorded as equivalent; inadequate: an unexplained miss; no-mutants: none ran. */
export function adequacyVerdict(m: Pick<MutantAdequacy, "caught" | "missed" | "equivalentRecorded">): AdequacyVerdict {
  if (m.caught.length + m.missed.length === 0) return "no-mutants";
  const unexplained = m.missed.filter((x) => !m.equivalentRecorded.includes(x));
  return unexplained.length > 0 ? "inadequate" : "adequate";
}

/** `finalSha256` is the sha256 of the pair record's code.final now. */
export function gateResult(ev: AdversarialEvidence, finalSha256: string): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (ev.cases.length === 0) reasons.push("no adversarial cases");

  for (const c of ev.cases) {
    if (c.status === "invalid") {
      reasons.push(`case ${c.id} is invalid: ${c.invalidReason ?? "no reason recorded"}`);
      continue;
    }
    if (!c.sqlServer || !c.postgres) reasons.push(`case ${c.id} did not run on both engines`);
    else if (!c.sqlServer.passed || !c.postgres.passed || c.differed) reasons.push(`case ${c.id} differed`);

    for (const t of c.traps) {
      const check = c.trapChecks[t];
      if (!check?.present) reasons.push(`case ${c.id} claims ${t} but the input does not contain it${check ? ` (${check.detail})` : ""}`);
    }
  }

  const byId = new Map(ev.cases.map((c) => [c.id, c]));
  for (const t of TRAP_IDS) {
    const cov = ev.traps[t];
    if (!cov) {
      reasons.push(`trap ${t} is missing from the evidence`);
      continue;
    }
    if (!cov.applicable) continue;
    const real = cov.coveredBy.filter((id) => byId.get(id)?.trapChecks[t]?.present === true && byId.get(id)?.traps.includes(t));
    if (real.length > 0) continue;
    if (cov.notApplicableReason && cov.accepted === true) continue;
    reasons.push(`applicable trap ${t} is not covered${cov.notApplicableReason ? " and the auditor did not accept the not-applicable reason" : ""}`);
  }

  for (const o of ev.objections) {
    if (o.status !== "resolved") reasons.push(`objection ${o.id} is open`);
    else if (!o.confirmedBy) reasons.push(`objection ${o.id} is resolved but not confirmed`);
  }

  const ids = ev.cases.map((c) => c.id).sort();
  const audited = [...ev.casesAudited].sort();
  if (ids.length !== audited.length || ids.some((id, i) => id !== audited[i])) reasons.push("audited case ids differ from the case ids");

  const m = ev.mutantAdequacy;
  if (m.verdict === "inadequate" || adequacyVerdict(m) === "inadequate") reasons.push(`mutant adequacy is inadequate (unexplained misses: ${m.missed.filter((x) => !m.equivalentRecorded.includes(x)).join(", ") || "none listed"})`);
  else if (adequacyVerdict(m) !== m.verdict) reasons.push("mutant adequacy verdict does not match its lists");

  if (ev.conversionSha256 !== finalSha256) reasons.push("the conversion changed since the gate ran (hash differs)");

  if (!ev.attacker?.model?.trim()) reasons.push("attacker model not recorded");
  if (!ev.auditor?.model?.trim()) reasons.push("auditor model not recorded");

  return { passed: reasons.length === 0, reasons };
}
