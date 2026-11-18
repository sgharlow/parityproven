/**
 * The MCP server's tool layer, free of any database or transport so it can be unit-tested.
 * Each exposed entity becomes one tool that runs ONE fixed, parameterised query against ONE view. No tool takes SQL text,
 * and arguments are only the entity's declared filters plus a row limit, so what a tool can read is fixed by the map.
 */
import type { AccessMap, ExposedEntity } from "./access-map.js";

export interface ToolQuery {
  text: string;
  /** Named parameters (@limit, @f_<filter>). Values are bound by the driver, never spliced into the text. */
  params: Record<string, string | number | null>;
}

const q = (ident: string): string => `[${ident}]`;

/** The fixed query text for an entity (the same text for every call; only parameter values change). */
export function queryText(e: ExposedEntity): string {
  const [schema, view] = e.view.split(".");
  const where = e.filters.map((f) => `(@f_${f.name} IS NULL OR ${q(f.column)} = @f_${f.name})`);
  return `SELECT TOP (@limit) ${e.columns.map(q).join(", ")} FROM ${q(schema)}.${q(view)}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${q(e.orderBy)}`;
}

/** Validate a call's arguments and build its query. Throws on anything not declared. */
export function buildQuery(e: ExposedEntity, args: Record<string, unknown>): ToolQuery {
  const allowed = new Set(["limit", ...e.filters.map((f) => f.name)]);
  for (const k of Object.keys(args ?? {})) if (!allowed.has(k)) throw new Error(`${e.tool}: unknown argument "${k}" (allowed: ${[...allowed].join(", ")})`);
  const rawLimit = args?.limit ?? e.maxRows;
  if (typeof rawLimit !== "number" || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > e.maxRows) {
    throw new Error(`${e.tool}: limit must be an integer from 1 to ${e.maxRows}`);
  }
  const params: ToolQuery["params"] = { limit: rawLimit };
  for (const f of e.filters) {
    const v = args?.[f.name];
    if (v !== undefined && v !== null && typeof v !== "string") throw new Error(`${e.tool}: ${f.name} must be text`);
    if (typeof v === "string" && v.length > 200) throw new Error(`${e.tool}: ${f.name} is longer than 200 characters`);
    params[`f_${f.name}`] = typeof v === "string" ? v : null;
  }
  return { text: queryText(e), params };
}

export type QueryFn = (q: ToolQuery) => Promise<Array<Record<string, unknown>>>;

/** Run one tool. Returns the rows (for the caller) and what the audit log records (never the rows). */
export async function runTool(map: AccessMap, tool: string, args: Record<string, unknown>, query: QueryFn):
  Promise<{ rows: Array<Record<string, unknown>>; audit: { tool: string; args: Record<string, unknown>; rowCount: number } }> {
  const e = map.exposed.find((x) => x.tool === tool);
  if (!e) throw new Error(`unknown tool "${tool}"`);
  const built = buildQuery(e, args ?? {});
  const rows = await query(built);
  return { rows, audit: { tool, args: args ?? {}, rowCount: rows.length } };
}

/** The map as a tool result: what an agent may read, how, and what it may not (no data). */
export function describeMap(map: AccessMap): string {
  return JSON.stringify({
    system: map.system, status: map.status,
    tools: map.exposed.map((e) => ({ tool: e.tool, entity: e.entity, view: e.view, filters: e.filters, columns: e.columns, maxRows: e.maxRows, risk: e.risk })),
    notExposed: map.notExposed, controls: map.controls, judgmentNote: map.judgmentNote,
  }, null, 2);
}
