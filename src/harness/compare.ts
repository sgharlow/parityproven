/**
 * Result-set comparator.
 * Compares two RowSets for equivalence: column count, column names,
 * row count, values (with type-aware coercion), and row order.
 *
 * Returns null when equivalent; returns a CompareResult with findings when not.
 */

import type { RowSet, CompareResult, Finding } from "./types.js";

export function compareRowSets(a: RowSet, b: RowSet): CompareResult {
  const findings: Finding[] = [];

  // 1. Column count
  if (a.columns.length !== b.columns.length) {
    findings.push({
      kind: "column-count-mismatch",
      detail: `SQL Server returned ${a.columns.length} columns; PostgreSQL returned ${b.columns.length}`,
    });
    // Cannot meaningfully compare rows — return early
    return { equivalent: false, findings };
  }

  // 2. Column names (exact, case-sensitive, spaces preserved)
  for (let i = 0; i < a.columns.length; i++) {
    if (a.columns[i].name !== b.columns[i].name) {
      findings.push({
        kind: "column-name-mismatch",
        detail: `Column ${i}: SQL Server="${a.columns[i].name}" PostgreSQL="${b.columns[i].name}"`,
        columnName: a.columns[i].name,
      });
    }
  }

  // 3. Row count
  if (a.rows.length !== b.rows.length) {
    findings.push({
      kind: "row-count-mismatch",
      detail: `SQL Server returned ${a.rows.length} rows; PostgreSQL returned ${b.rows.length}`,
    });
    // Still compare as many rows as we can for richer diagnostics
  }

  // 4. Value and order comparison (per-row, per-column)
  const minRows = Math.min(a.rows.length, b.rows.length);
  for (let ri = 0; ri < minRows; ri++) {
    for (let ci = 0; ci < a.columns.length; ci++) {
      const colName = a.columns[ci].name;
      const aVal = a.rows[ri][ci];
      const bVal = b.rows[ri][ci];

      if (!valuesEquivalent(aVal, bVal)) {
        findings.push({
          kind: "value-mismatch",
          detail: `Row ${ri} column "${colName}": SQL Server=${JSON.stringify(aVal)} PostgreSQL=${JSON.stringify(bVal)}`,
          rowIndex: ri,
          columnName: colName,
          sqlServerValue: aVal,
          postgresValue: bVal,
        });
      }
    }
  }

  const equivalent = findings.length === 0;
  return { equivalent, findings };
}

/**
 * Type-aware value equivalence.
 * Handles null, numbers, strings, Dates, and bigints.
 * Does NOT apply any coercion beyond what the engines already applied —
 * load-time truncations are surfaced as load-time findings by the property,
 * not hidden here.
 */
function valuesEquivalent(a: unknown, b: unknown): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;

  // Both are Dates
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // One is Date, one is string (postgres may return timestamp as string)
  if (a instanceof Date && typeof b === "string") {
    return a.getTime() === new Date(b).getTime();
  }
  if (typeof a === "string" && b instanceof Date) {
    return new Date(a).getTime() === b.getTime();
  }

  // Numbers — compare with ===; both engines should agree on integer values
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    return a === b;
  }

  // Bigint vs number
  if (typeof a === "bigint" && typeof b === "number") return Number(a) === b;
  if (typeof a === "number" && typeof b === "bigint") return a === Number(b);

  // String comparison (column names with spaces, varchar values)
  if (typeof a === "string" && typeof b === "string") return a === b;

  return a === b;
}
