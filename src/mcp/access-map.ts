/**
 * The Agent Access Map (web/data/agent-access-map.json): the single source for the MCP server's tools and for the live
 * /access-map page. Committed, reviewed by a person, never generated from the database.
 */
import { readFileSync } from "fs";

export interface ExposedEntity {
  entity: string;
  actions: string[];
  /** Schema-qualified view, e.g. Website.Customers. The reader's login has SELECT on this view only. */
  view: string;
  tool: string;
  filters: Array<{ name: string; column: string; description: string }>;
  columns: string[];
  orderBy: string;
  maxRows: number;
  risk: { sensitivity: "low" | "medium" | "high"; writeRisk: string; rationale: string };
}

export interface AccessMap {
  system: string;
  sourceDatabase: string;
  status: string;
  judgmentNote: string;
  exposed: ExposedEntity[];
  notExposed: Array<{ entity: string; reason: string; risk: string }>;
  /** rowLevelRoles: database roles the reader joins so the database's row-level security shows it some rows (no permissions). */
  controls: { authentication: string; readOnlyBy: string; rowLimits: string; audit: string; rowLevelRoles?: string[] };
  firstUseCase: { title: string; description: string; effortHours: { p50: number; p90: number }; effortBasis: string };
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TOOL = /^[a-z][a-z0-9_]*$/;

/** Problems with a map; empty when it can drive the server and the page. */
export function validateAccessMap(m: AccessMap): string[] {
  const p: string[] = [];
  if (!m.exposed?.length) p.push("no exposed entities");
  const tools = new Set<string>();
  for (const e of m.exposed ?? []) {
    const at = `${e.entity}:`;
    const parts = (e.view ?? "").split(".");
    if (parts.length !== 2 || !parts.every((x) => IDENT.test(x))) p.push(`${at} view "${e.view}" is not Schema.View`);
    if (!TOOL.test(e.tool ?? "")) p.push(`${at} tool name "${e.tool}" is not lower_snake_case`);
    if (tools.has(e.tool)) p.push(`${at} tool "${e.tool}" is declared twice`);
    tools.add(e.tool);
    if (!e.actions?.length) p.push(`${at} no actions (item 1)`);
    if (!e.columns?.length) p.push(`${at} no columns`);
    for (const c of [...(e.columns ?? []), e.orderBy, ...(e.filters ?? []).map((f) => f.column)]) if (!IDENT.test(c ?? "")) p.push(`${at} column "${c}" is not an identifier`);
    for (const f of e.filters ?? []) if (!IDENT.test(f.name ?? "") || f.name === "limit") p.push(`${at} filter name "${f.name}" is not allowed`);
    if (!Number.isInteger(e.maxRows) || e.maxRows < 1 || e.maxRows > 500) p.push(`${at} maxRows must be 1..500`);
    if (!["low", "medium", "high"].includes(e.risk?.sensitivity)) p.push(`${at} risk.sensitivity must be low, medium or high (item 4)`);
  }
  if (!m.controls?.authentication || !m.controls?.rowLimits || !m.controls?.audit || !m.controls?.readOnlyBy) p.push("controls must state authentication, read-only design, row limits and audit (item 3)");
  const eff = m.firstUseCase?.effortHours;
  if (!m.firstUseCase?.title || !eff || !(eff.p50 > 0) || !(eff.p90 >= eff.p50)) p.push("firstUseCase needs a title and an effort range with p90 >= p50 (item 5)");
  if (!/judgment/i.test(m.judgmentNote ?? "") || !/judgment/i.test(m.firstUseCase?.effortBasis ?? "")) p.push("risk ratings and the effort range must be labelled as judgments");
  return p;
}

export function loadAccessMap(path: string): AccessMap {
  const m = JSON.parse(readFileSync(path, "utf-8")) as AccessMap;
  const problems = validateAccessMap(m);
  if (problems.length) throw new Error(`agent access map ${path} is not valid:\n  ${problems.join("\n  ")}`);
  return m;
}
