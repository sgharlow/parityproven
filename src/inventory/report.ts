import type { InventoryItem, InventoryReport, TierCounts } from "./types.js";
import type { ObjectClass } from "../pairs/schema.js";

const CLASSES: ObjectClass[] = ["procedure", "function", "view", "trigger"];

export const TIER_RULE_CHANGES: string[] = [
  "2026-11-11: dynamic SQL now also matches EXECUTE (@sql) (was EXEC( only), and table variables also match DECLARE @t AS TABLE. " +
    "In WideWorldImporters this moved 12 procedures to complex (all database-administration or sequence procedures: " +
    "Application.Configuration_* except ConfigureForEnterpriseEdition, AddRoleMemberIfNonexistent, CreateRoleIfNonexistent, " +
    "DataLoadSimulation.DeactivateTemporalTablesBeforeDataLoad, Sequences.ReseedSequenceBeyondTableValues). AdventureWorks2025 is unchanged. " +
    "The v1 predictions (committed 2026-11-08) were made against the earlier tiers and are not edited.",
];

export function buildReport(items: InventoryItem[], database: string): InventoryReport {
  // Build per-class tier counts
  const counts = {} as InventoryReport["counts"];
  for (const cls of CLASSES) {
    const subset = items.filter((i) => i.objectClass === cls);
    counts[cls] = {
      simple:  subset.filter((i) => i.tier === "simple").length,
      medium:  subset.filter((i) => i.tier === "medium").length,
      complex: subset.filter((i) => i.tier === "complex").length,
      total:   subset.length,
    };
  }
  counts.total = items.length;

  return {
    database,
    generatedAt: new Date().toISOString(),
    tierRuleChanges: TIER_RULE_CHANGES,
    counts,
    objects: items,
  };
}

/** Format a summary table string for stdout. */
export function formatSummaryTable(report: InventoryReport): string {
  const HR = "─".repeat(50);
  const pad = (s: string | number, w: number) => String(s).padStart(w);
  const header = `${report.database} inventory`;
  const colW = [12, 8, 8, 9, 7];

  const row = (label: string, c: TierCounts) =>
    `${label.padEnd(colW[0])}${pad(c.simple, colW[1])}${pad(c.medium, colW[2])}${pad(c.complex, colW[3])}${pad(c.total, colW[4])}`;

  const totalCounts: TierCounts = {
    simple:  CLASSES.reduce((n, c) => n + report.counts[c].simple, 0),
    medium:  CLASSES.reduce((n, c) => n + report.counts[c].medium, 0),
    complex: CLASSES.reduce((n, c) => n + report.counts[c].complex, 0),
    total:   report.counts.total,
  };

  return [
    header,
    HR,
    `${"Type".padEnd(colW[0])}${pad("Simple", colW[1])}${pad("Medium", colW[2])}${pad("Complex", colW[3])}${pad("Total", colW[4])}`,
    ...CLASSES.map((c) => row(c, report.counts[c])),
    HR,
    row("TOTAL", totalCounts),
    HR,
  ].join("\n");
}
