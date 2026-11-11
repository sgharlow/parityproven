/**
 * Automatic planted defects for a conversion that declares none.
 *
 * Each operator makes one small, plausible mistake in the PostgreSQL text (the kind a hurried
 * conversion makes). The first two operators that apply are used, in a fixed order, so the set
 * does not depend on which ones would happen to be detected. A mutant that SURVIVES is reported
 * by the CLI: it is either an equivalent mutation or a gap in the generated data, and must be
 * looked at by a person; it is never silently dropped.
 */

import type { Mutant } from "../harness/generic/spec.js";

interface Operator { name: string; pattern: RegExp; replace: (m: RegExpMatchArray) => string }

const OPERATORS: Operator[] = [
  { name: "LEFT JOIN becomes INNER JOIN", pattern: /LEFT (?:OUTER )?JOIN/i, replace: () => "INNER JOIN" },
  // two projected columns swap values (keeps names, so only a value comparison can catch it)
  {
    name: "two output columns swap values",
    pattern: /(\w+\."\w+") AS "(\w+)"([\s\S]*?)(\w+\."\w+") AS "(\w+)"/,
    replace: (m) => `${m[4]} AS "${m[2]}"${m[3]}${m[1]} AS "${m[5]}"`,
  },
  // a join condition points at the wrong column of the same table
  { name: "join condition uses a different key", pattern: /ON (\w+)\."(\w+)" = (\w+)\."(\w+)"/, replace: (m) => `ON ${m[1]}."${m[2]}" = ${m[1]}."${m[2]}"` },
  { name: "first CASE result text altered", pattern: /THEN '([^']+)'/, replace: (m) => `THEN '${m[1]}!'` },
  { name: "first numeric literal changed", pattern: /(?<![\w.'"])(\d+\.\d+)(?![\w'"])/, replace: (m) => String(Number(m[1]) + (Number(m[1]) < 1 ? 0.01 : 1)) },
  { name: "strict comparison made inclusive", pattern: /(\S) > (\S)/, replace: (m) => `${m[1]} >= ${m[2]}` },
  { name: "inclusive comparison made strict", pattern: /(\S) <= (\S)/, replace: (m) => `${m[1]} < ${m[2]}` },
  { name: "round() becomes trunc()", pattern: /\bround\(/i, replace: () => "trunc(" },
  { name: "first AND becomes OR", pattern: /\bAND\b/, replace: () => "OR" },
  { name: "COALESCE first argument dropped", pattern: /COALESCE\(([^,()]+),\s*[^()]+\)/i, replace: (m) => m[1] },
  { name: "UNION ALL becomes UNION", pattern: /UNION ALL/, replace: () => "UNION" },
];

export function autoMutants(finalSql: string, max = 2): Mutant[] {
  const out: Mutant[] = [];
  // ignore comment lines so operators only touch executable text
  const body = finalSql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const op of OPERATORS) {
    const m = body.match(op.pattern);
    if (!m) continue;
    out.push({ name: `auto: ${op.name}`, from: m[0], to: op.replace(m) });
    if (out.length === max) break;
  }
  return out;
}
