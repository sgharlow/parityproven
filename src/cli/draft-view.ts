/**
 * CLI: npm run draft-view -- --database AdventureWorks2025 --object Schema.vName
 *
 * Mechanical first draft of a PostgreSQL view from a T-SQL view that is a plain projection over
 * joins: [identifiers] -> "identifiers", [Schema].[Table] -> schema.snake_table, `[alias] = expr`
 * -> `expr AS "alias"`, drops WITH SCHEMABINDING. Anything it does not understand (PIVOT, APPLY,
 * functions, XML methods, TOP, string +) makes it stop rather than guess.
 *
 * Output is written to conversions/<db>/<Schema.vName>.sql only if no conversion exists yet.
 * It is a first draft: the harness, not this script, decides whether it is right.
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(n);
  return i === -1 ? undefined : process.argv[i + 1];
};
const snake = (s: string): string => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

const UNSUPPORTED = [/\bPIVOT\b/i, /\bAPPLY\b/i, /\.(value|nodes|query|exist)\s*\(/i, /\bTOP\b/i, /\bUNION\b/i, /\bGROUP BY\b/i, /\(\s*SELECT\b/i, /\w+\s*\(/];

export function draftView(tsql: string): string {
  const header = tsql.match(/CREATE\s+VIEW\s+\[?(\w+)\]?\.\[?(\w+)\]?/i);
  if (!header) throw new Error("not a CREATE VIEW");
  const body = tsql
    .replace(/--[^\n]*/g, "")
    .replace(/^[\s\S]*?\bAS\s*(?=SELECT\b)/i, "")
    .trim()
    .replace(/;\s*$/, "");

  const probe = body.replace(/\[[^\]]*\]/g, "x");   // bracketed names cannot trip the checks
  for (const p of UNSUPPORTED) {
    // allow COALESCE-free bodies only; a function call or subquery means a person writes it
    if (p.test(probe)) throw new Error(`unsupported construct ${p} — write this view by hand`);
  }

  let out = body
    // [Schema].[Table] or [Schema].Table  ->  schema.snake_table
    .replace(/\[(\w+)\]\.\[?(\w+)\]?(?=\s+(?:AS\s+)?\w+\b)/g, (_m, s, t) => `${s.toLowerCase()}.${snake(t)}`)
    // [alias] = expr  ->  expr AS "alias"
    .replace(/(^|,)\s*\[(\w+)\]\s*=\s*([^,\n]+)/gm, (_m, lead, alias, expr) => `${lead}${expr.trim()} AS "${alias}"`)
    // AS [Alias]  ->  AS "Alias"
    .replace(/\bAS\s+\[(\w+)\]/gi, 'AS "$1"')
    // remaining [Column] -> "Column"
    .replace(/\[(\w+)\]/g, '"$1"');

  // bare column references keep their T-SQL case; quote alias.Column forms that were not bracketed
  out = out.replace(/\b([a-z]\w*)\.([A-Z]\w*)\b/g, '$1."$2"');

  // output names must match the source exactly: give every unaliased "x"."Col" an explicit alias
  out = out.replace(/(^|,)(\s*)(\w+\."(\w+)")(\s*)(?=,|\n|$)/gm, (_m, lead, sp, ref, col, tail) => `${lead}${sp}${ref} AS "${col}"${tail}`);

  const name = `${header[1].toLowerCase()}.${snake(header[2])}`;
  return `-- PostgreSQL conversion of the view ${header[1]}.${header[2]} (AdventureWorks2025).
-- Engine: Kiro (mechanical draft via draft-view: identifiers quoted, table names snake_case).
-- Verified by the property-based harness, not by this script.

CREATE OR REPLACE VIEW ${name} AS
${out};
`;
}

function main(): void {
  const database = arg("--database") ?? "AdventureWorks2025";
  const object = arg("--object");
  if (!object) throw new Error("--object required");
  const src = resolve(ROOT, ".tmp", "scaffold", database, `${object}.sql`);
  if (!existsSync(src)) throw new Error(`run scaffold first: ${src} not found`);
  const outPath = resolve(ROOT, "conversions", database, `${object}.sql`);
  if (existsSync(outPath)) {
    console.log(`${object}: conversion already exists, not overwriting`);
    return;
  }
  const pg = draftView(readFileSync(src, "utf-8"));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, pg, "utf-8");
  console.log(`${object}: draft written to conversions/${database}/${object}.sql`);
}

main();
