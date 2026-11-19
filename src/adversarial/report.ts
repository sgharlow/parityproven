/** Builds the human report for one batch from evidence JSON and pair records only. Pure. */
import { CHECKLIST } from "../pairs/checklist.js";
import type { PairRecord } from "../pairs/schema.js";
import type { AdversarialEvidence, TrapId } from "./schema.js";

export interface ReportItem {
  evidence: AdversarialEvidence;
  pair: PairRecord;
  /** repo-relative path of the evidence JSON */
  evidencePath: string;
}

const OWNER = "owner judgment";
const cell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

function trapText(ev: AdversarialEvidence, t: TrapId): string {
  const cov = ev.traps[t];
  if (!cov.applicable) return `${t}: not applicable to this object's inputs`;
  if (cov.coveredBy.length) {
    const details = cov.coveredBy.map((id) => `${id} (${ev.cases.find((c) => c.id === id)?.trapChecks[t]?.detail ?? "present"})`);
    return `${t}: covered by ${details.join("; ")}`;
  }
  if (cov.notApplicableReason) return `${t}: attacker says not applicable: ${cov.notApplicableReason} (auditor ${cov.accepted ? "accepted" : "did not accept"})`;
  return `${t}: NOT COVERED`;
}

function itemEvidence(item: ReportItem, id: string): string {
  const { evidence: ev, pair } = item;
  const c = CHECKLIST.find((x) => x.id === id)!;
  if (c.traps) return c.traps.map((t) => trapText(ev, t)).join("<br>");
  switch (id) {
    case "does-what-tsql-does":
      return `${ev.wording} (agent-written, run on both engines). Step 3: ${pair.evidence.samples ?? "no data"} samples, ${pair.evidence.rowsCompared ?? "no data"} rows compared, seeds ${pair.evidence.pbtSeeds?.join(", ") ?? "no data"}. ${OWNER}: whether the inputs cover what the object accepts.`;
    case "not-claimed":
      return `${OWNER}. Notes: ${pair.code.notes?.length ? pair.code.notes.join(" / ") : "none recorded"}`;
    case "column-mappings":
      return pair.columnMappings.length ? pair.columnMappings.map((m) => `${m.sqlServerType} -> ${m.postgresType}${m.notes ? ` (${m.notes})` : ""}`).join("; ") : "no mappings recorded";
    case "cases-catch-mistakes": {
      const m = ev.mutantAdequacy;
      return `Planted defects on the adversarial cases: ${m.verdict}; caught ${m.caught.length}, missed ${m.missed.length} (equivalent recorded: ${m.equivalentRecorded.length}), not deployable ${m.skipped.length}.` +
        (m.missed.length ? ` Missed: ${m.missed.join("; ")}.` : "");
    }
    case "expected-match-labels":
      return `${OWNER}. Expected results are in tests/${ev.database}/${ev.object}.adversarial.expected.json. Cases: ${ev.cases.map((x) => `${x.id} ${x.label}`).join("; ")}`;
    default:
      return OWNER;
  }
}

export function buildReport(batch: string, items: ReportItem[], date: string): string {
  const out: string[] = [
    `# Adversarial evidence report: batch ${batch}`,
    "",
    `Built ${date} by \`npm run adversarial -- report --batch ${batch}\` from the evidence JSON and pair records. The cases are agent-written; expected values were captured from the original T-SQL. The gate result below is computed by code from engine results.`,
    "",
    "| Object | Cases | Gate | Mutant adequacy | Same model |",
    "|---|---|---|---|---|",
    ...items.map(({ evidence: e }) => `| ${e.database} ${e.object} | ${e.wording} | ${e.gate.passed ? "pass" : "FAIL"} | ${e.mutantAdequacy.verdict} | ${e.sameModel ? "yes" : "no"} |`),
    "",
  ];
  for (const item of items) {
    const e = item.evidence;
    out.push(`## ${e.database} ${e.object}`, "", `${e.wording}. Gate: ${e.gate.passed ? "pass" : "FAIL"}. Attacker ${e.attacker.model}, auditor ${e.auditor.model}${e.sameModel ? " (same model)" : ""}. Evidence: \`${item.evidencePath}\`.`, "");
    if (!e.gate.passed) out.push(...e.gate.reasons.map((r) => `- ${r}`), "");
    out.push("| Step-5 checklist item | Evidence |", "|---|---|");
    for (const c of CHECKLIST) {
      if (c.conditional === "testsRun" && !item.pair.evidence.testsRun?.length) continue;
      out.push(`| ${cell(c.text)} | ${cell(itemEvidence(item, c.id))} |`);
    }
    out.push("");
    if (e.objections.length) out.push("Objections:", ...e.objections.map((o) => `- ${o.id} (${o.kind}, ${o.status}${o.confirmedBy ? `, confirmed by ${o.confirmedBy.model}` : ""}): ${o.text}`), "");
    out.push("Cases:", ...e.cases.map((c) => `- ${c.id} ${c.label}: ${c.status === "invalid" ? `invalid (${c.invalidReason})` : `SQL Server ${c.sqlServer?.passed ? "pass" : "FAIL"}, PostgreSQL ${c.postgres?.passed ? "pass" : "FAIL"}`}; traps ${c.traps.join(", ") || "none"}`), "");
  }
  out.push("## Approval", "", "The owner approves at a terminal, not an agent:", "", "```", `npm run approve -- --report evidence/adversarial/reports/batch-${batch}.md --reviewer "<name>" --date <yyyy-mm-dd>`, "```", "");
  return out.join("\n");
}
