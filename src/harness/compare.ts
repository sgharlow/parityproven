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

  // Both are Dates.
  // date-only columns come back as Date objects at local midnight (pg) vs UTC midnight (mssql).
  // If one is at UTC midnight, compare as calendar date strings to avoid TZ skew.
  if (a instanceof Date && b instanceof Date) {
    if (a.getTime() === b.getTime()) return true;
    const aAtMidnightUtc = a.getUTCHours() === 0 && a.getUTCMinutes() === 0 && a.getUTCSeconds() === 0 && a.getUTCMilliseconds() === 0;
    const bAtMidnightUtc = b.getUTCHours() === 0 && b.getUTCMinutes() === 0 && b.getUTCSeconds() === 0 && b.getUTCMilliseconds() === 0;
    if (aAtMidnightUtc || bAtMidnightUtc) {
      // At least one is a date-only value — compare calendar dates in UTC
      return toDateString(a) === toDateString(b);
    }
    return false;
  }

  // One is Date (mssql), one is string (pg with custom type parser) — normalise both to UTC ISO string
  if (a instanceof Date && typeof b === "string") {
    // date-only string from pg e.g. "2020-06-15"
    if (/^\d{4}-\d{2}-\d{2}$/.test(b)) {
      return toDateString(a) === b;
    }
    // timestamp string from pg e.g. "2020-06-15 12:00:00" or "2020-06-15T12:00:00"
    return toTimestampMs(a) === toTimestampMs(b);
  }
  if (typeof a === "string" && b instanceof Date) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(a)) {
      return a === toDateString(b);
    }
    return toTimestampMs(a) === toTimestampMs(b);
  }

  // Both strings — if they look like timestamps/dates, normalise
  if (typeof a === "string" && typeof b === "string") {
    if (looksLikeDate(a) && looksLikeDate(b)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b)) {
        return a === b;
      }
      return toTimestampMs(a) === toTimestampMs(b);
    }
    return a === b;
  }

  // Numbers — compare with ===; both engines should agree on integer values
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    return a === b;
  }

  // Bigint vs number
  if (typeof a === "bigint" && typeof b === "number") return Number(a) === b;
  if (typeof a === "number" && typeof b === "bigint") return a === Number(b);

  return a === b;
}

/** Normalise a date value to YYYY-MM-DD, stripping time and TZ. */
function toDateString(val: Date | string): string {
  const s = val instanceof Date ? val.toISOString() : val;
  return s.substring(0, 10);
}

/** Normalise a date/timestamp value to UTC milliseconds for comparison. */
function toTimestampMs(val: Date | string): number {
  if (val instanceof Date) return val.getTime();
  // pg returns timestamps as "YYYY-MM-DD HH:MM:SS.ffffff" (no T, no Z)
  // Treat as UTC (the stored value is what was inserted — no TZ applied)
  const normalised = val.replace(" ", "T") + "Z";
  return new Date(normalised).getTime();
}

function looksLikeDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(s);
}
