/**
 * The step-5 checklist (verification-standard.md), in one place. The review packet and the adversarial report both use it.
 * `traps` names the adversarial trap ids an item corresponds to; `conditional: "testsRun"` marks an item shown only when
 * the object has agreed tests.
 */
import type { TrapId } from "../adversarial/schema.js";

export interface ChecklistItem {
  id: string;
  text: string;
  traps?: TrapId[];
  conditional?: "testsRun";
}

export const CHECKLIST: ChecklistItem[] = [
  { id: "does-what-tsql-does", text: "The conversion does what the T-SQL does for every input the object accepts, not only for the generated ones." },
  { id: "null-vs-empty", text: "NULL versus empty string, including concatenation and ISNULL/COALESCE.", traps: ["null-vs-empty"] },
  { id: "collation-case", text: "Collation and case sensitivity in comparisons, ORDER BY and GROUP BY.", traps: ["collation-case"] },
  { id: "dates-datetime", text: "Dates and datetime precision (datetime 3.33 ms rounding, datetime2, time zones, boundary dates).", traps: ["dates-datetime"] },
  { id: "numeric-rounding", text: "Numeric rounding and scale (money, decimal(p,s), integer division, ROUND).", traps: ["numeric-rounding"] },
  { id: "spaces-ties-gaps", text: "Trailing spaces; TOP with and without ties; identity and sequence gaps.", traps: ["trailing-spaces", "top-ties", "identity-gaps"] },
  { id: "not-claimed", text: "Every 'not claimed' statement in the notes is acceptable, and nothing else is silently assumed." },
  { id: "column-mappings", text: "The column-type mappings are right for this object." },
  { id: "cases-catch-mistakes", text: "The generated data and fixed cases would catch the mistakes a converter is most likely to make here." },
  { id: "expected-match-labels", text: "Each agreed test's expected result is what its label says the T-SQL should return (they were captured from the source engine).", conditional: "testsRun" },
];

/** The checklist lines as printed in the review packet. */
export function checklistLines(hasTests: boolean): string[] {
  return CHECKLIST.filter((c) => c.conditional !== "testsRun" || hasTests).map((c) => `- [ ] ${c.text}`);
}
