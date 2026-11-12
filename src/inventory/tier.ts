/**
 * Complexity tier classifier.
 * Single implementation — imported by the inventory CLI, the receipts builder,
 * and the pair record tooling. Never redefine elsewhere.
 *
 * Rules from pair-records.md (checked in order; first match wins):
 *
 * COMPLEX if the definition contains any of:
 *   dynamic SQL (EXEC(@sql), sp_executesql), cursors, CLR assembly,
 *   cross-database references (db..object), linked servers,
 *   OPENQUERY, OPENROWSET, xp_ extended procedures.
 *
 * MEDIUM if it contains any of:
 *   temp tables (#t, ##t), table variables (DECLARE @t TABLE),
 *   MERGE, TRY/CATCH, window functions (OVER (), OUTPUT clause.
 *
 * SIMPLE otherwise.
 */

import type { Tier } from "../pairs/schema.js";

const COMPLEX_PATTERNS: RegExp[] = [
  /\bEXEC(?:UTE)?\s*\(/i,                  // EXEC(@sql) / EXECUTE (@sql) dynamic execution (EXECUTE form added 2026-11-11)
  /\bsp_executesql\b/i,                    // sp_executesql
  /\bCURSOR\b/i,                           // cursor declaration
  /\b(EXTERNAL|UNSAFE)\s+ASSEMBLY\b/i,     // CLR assembly
  /\w+\.\.\w+/,                            // cross-database: db..object
  /\bOPENQUERY\b/i,                        // OPENQUERY linked server
  /\bOPENROWSET\b/i,                       // OPENROWSET
  /\bxp_\w+/i,                             // xp_ extended procedures
];

const MEDIUM_PATTERNS: RegExp[] = [
  /(?:^|[^'"@\w])#[\w]+/,                  // temp table (#t or ##t) — not preceded by word/quote chars
  /\bDECLARE\s+@\w+\s+(?:AS\s+)?TABLE\b/i, // table variable (DECLARE @t AS TABLE form added 2026-11-11)
  /\bMERGE\b/i,                            // MERGE statement
  /\bTRY\b[\s\S]*?\bCATCH\b/i,            // TRY...CATCH block
  /\bOVER\s*\(/i,                          // window function
  /\bOUTPUT\b/i,                           // OUTPUT clause
];

export function classifyTier(definition: string): Tier {
  for (const pattern of COMPLEX_PATTERNS) {
    if (pattern.test(definition)) return "complex";
  }
  for (const pattern of MEDIUM_PATTERNS) {
    if (pattern.test(definition)) return "medium";
  }
  return "simple";
}
