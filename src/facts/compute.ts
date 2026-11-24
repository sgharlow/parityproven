/**
 * Facts for the owner's writing (submission-closeout REQ-7). Pure: reads only committed files under `root`, no git, no process.
 * Every number the description, write-up, video cards and social post may use comes from here. It holds figures and file paths,
 * never sentences meant for pasting: every word of the submission is the owner's.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

export interface RecordFacts {
  receipts: { inventory: number; total: number; verified: number; pending: number; failed: number; excluded: number; notAttempted: number };
  converted: number;
  rowsCompared: number;
  plantedDefectsCaught: number;
  firstDrafts: { recorded: number; failedOnFirstRun: number };
  steps: { step2Pass: number; step3Pass: number; step4: { pass: number; na: number; fail: number }; step5Recorded: number; step5Methods: string[]; step5Reviewers: string[] };
  agreedRuntimeFactors: string[];
  humanMinutes: { total: number; recordsWithMinutes: number };
  batchReview: { batches: number; minutesPerBatch: number[]; totalMinutes: number };
  adversarial: { objectsGated: number; casesRan: number; casesDiffered: number; gatePass: number; regressionCases: number; models: string[] };
  kiro: { specs: string[]; steering: string[]; hooks: string[] };
  mcp: { toolCalls: number; clients: string[] };
  features: Array<{ feature: string; used: boolean; artifacts: string[] }>;
}

const json = (p: string): any => JSON.parse(readFileSync(p, "utf-8"));
const dirs = (p: string): string[] => (existsSync(p) ? readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : []);
const files = (p: string): string[] => (existsSync(p) ? readdirSync(p, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name).sort() : []);
const sortedUnique = (xs: string[]): string[] => [...new Set(xs)].sort();

function batchReview(root: string): RecordFacts["batchReview"] {
  const p = join(root, "evidence", "review-time", "batch-minutes.json");
  if (!existsSync(p)) return { batches: 0, minutesPerBatch: [], totalMinutes: 0 };
  const minutes = Object.entries(json(p).batches as Record<string, { minutes: number }>).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v.minutes);
  return { batches: minutes.length, minutesPerBatch: minutes, totalMinutes: minutes.reduce((s, m) => s + m, 0) };
}

export function computeRecordFacts(root: string): RecordFacts {
  const idx = json(join(root, "receipts", "index.json")).summary;
  const pairs: any[] = [];
  for (const db of dirs(join(root, "pairs"))) for (const f of files(join(root, "pairs", db)).filter((x) => x.endsWith(".json"))) pairs.push(json(join(root, "pairs", db, f)));
  const ran = pairs.filter((p) => p.evidence.step1 !== "not-run");
  const drafts = pairs.filter((p) => p.evidence.engineOutputCheck);

  const ev: any[] = [];
  const ed = join(root, "evidence", "adversarial");
  for (const db of dirs(ed).filter((d) => d !== "reports")) for (const f of files(join(ed, db)).filter((x) => x.endsWith(".json"))) {
    const e = json(join(ed, db, f));
    if (e.summary && e.gate) ev.push(e);
  }
  let regression = 0;
  const ad = join(root, "adversarial");
  for (const db of dirs(ad)) for (const f of files(join(ad, db)).filter((x) => x.endsWith(".cases.json"))) regression += json(join(ad, db, f)).cases.filter((c: any) => c.regression).length;

  const mcpLog = join(root, "evidence", "mcp", "tool-calls.jsonl");
  const calls = existsSync(mcpLog) ? readFileSync(mcpLog, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const kiroDir = join(root, ".kiro");
  const specs = dirs(join(kiroDir, "specs"));
  const steering = files(join(kiroDir, "steering"));
  const hooks = files(join(kiroDir, "hooks"));
  const pkg = json(join(root, "package.json"));
  const hasFastCheck = Boolean(pkg.dependencies?.["fast-check"] ?? pkg.devDependencies?.["fast-check"]);
  const mcpConfig = join(kiroDir, "settings", "mcp.json");
  const kiroCalls = calls.filter((c) => /kiro/i.test(String(c.client ?? c.clientName ?? ""))).length;
  const has = (p: string): boolean => existsSync(join(root, p));

  return {
    receipts: { inventory: idx.inventory, total: idx.total, verified: idx.verified, pending: idx.pending, failed: idx.failed, excluded: idx.excluded, notAttempted: idx.notAttempted },
    converted: ran.length,
    rowsCompared: ran.reduce((s, p) => s + (p.evidence.rowsCompared ?? 0), 0),
    plantedDefectsCaught: ran.reduce((s, p) => s + (p.evidence.mutantsDetected?.length ?? 0), 0),
    firstDrafts: { recorded: drafts.length, failedOnFirstRun: drafts.filter((p) => p.evidence.engineOutputCheck.step3 === "fail").length },
    steps: {
      step2Pass: pairs.filter((p) => p.evidence.step2 === "pass").length,
      step3Pass: pairs.filter((p) => p.evidence.step3 === "pass").length,
      step4: { pass: pairs.filter((p) => p.evidence.step4 === "pass").length, na: pairs.filter((p) => p.evidence.step4 === "n/a").length, fail: pairs.filter((p) => p.evidence.step4 === "fail").length },
      step5Recorded: pairs.filter((p) => p.evidence.step5 === "pass").length,
      step5Methods: sortedUnique(pairs.map((p) => p.evidence.step5Method).filter(Boolean)),
      step5Reviewers: sortedUnique(pairs.filter((p) => p.evidence.reviewer).map((p) => `${p.evidence.reviewer} ${p.evidence.reviewDate}`)),
    },
    agreedRuntimeFactors: sortedUnique(pairs.filter((p) => p.evidence.runtime && p.evidence.runtime.threshold !== 1.5).map((p) => `${p.evidence.runtime.threshold}x`)),
    batchReview: batchReview(root),
    humanMinutes: { total: pairs.reduce((s, p) => s + (p.effort.humanMinutes ?? 0), 0), recordsWithMinutes: pairs.filter((p) => (p.effort.humanMinutes ?? 0) > 0).length },
    adversarial: {
      objectsGated: ev.length, casesRan: ev.reduce((s, e) => s + e.summary.ran, 0), casesDiffered: ev.reduce((s, e) => s + e.summary.differed, 0),
      gatePass: ev.filter((e) => e.gate.passed).length, regressionCases: regression,
      models: sortedUnique(ev.map((e) => `attacker: ${e.attacker.model}; auditor: ${e.auditor.model}`)),
    },
    kiro: { specs, steering, hooks },
    mcp: { toolCalls: calls.length, clients: sortedUnique(calls.map((c) => String(c.client ?? c.clientName ?? ""))) },
    features: [
      { feature: "Kiro IDE (hooks fired on saves in this workspace)", used: has("evidence/hooks/observed-runs-2026-11-20.txt"), artifacts: ["evidence/hooks/observed-runs-2026-11-20.txt"].filter(has) },
      { feature: "Kiro CLI", used: false, artifacts: [] },
      { feature: "Kiro Web", used: false, artifacts: [] },
      { feature: "Kiro Crew", used: false, artifacts: [] },
      { feature: "Custom agents (a definition file in the repo)", used: has(".kiro/agents"), artifacts: has(".kiro/agents") ? [".kiro/agents"] : [] },
      { feature: "Agent hooks", used: hooks.length > 0, artifacts: hooks.map((h) => `.kiro/hooks/${h}`) },
      { feature: "Spec-driven development", used: specs.length > 0, artifacts: specs.map((s) => `.kiro/specs/${s}`) },
      { feature: "Steering", used: steering.length > 0, artifacts: steering.map((s) => `.kiro/steering/${s}`) },
      { feature: "MCP (project-built read-only server, called by Kiro)", used: kiroCalls > 0, artifacts: ["src/mcp", ".kiro/settings/mcp.json", "evidence/mcp/tool-calls.jsonl"].filter((p) => has(p) || p === ".kiro/settings/mcp.json" && existsSync(mcpConfig)) },
      { feature: "Property-based testing (fast-check)", used: hasFastCheck, artifacts: ["src/harness/generic"].filter(has) },
      { feature: "Kiro workflows with sub-agents", used: has(".agents/workflows") || has(".agents/tasks"), artifacts: [".agents/README.md", ".agents/workflows", ".agents/tasks"].filter(has) },
      { feature: "Kiro powers", used: false, artifacts: [] },
    ],
  };
}

export const FACTS_JSON_START = "<!-- facts-json:start";
export const FACTS_JSON_END = "facts-json:end -->";

/** The record facts embedded in a committed facts file, or null. */
export function embeddedFacts(markdown: string): RecordFacts | null {
  const s = markdown.indexOf(FACTS_JSON_START);
  const e = markdown.indexOf(FACTS_JSON_END);
  if (s < 0 || e < 0) return null;
  return JSON.parse(markdown.slice(s + FACTS_JSON_START.length, e)) as RecordFacts;
}
