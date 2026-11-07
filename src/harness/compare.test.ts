import { describe, it, expect } from "vitest";
import { compareRowSets } from "./compare.js";
import type { RowSet } from "./types.js";

const baseColumns = [
  { name: "WWI Invoice ID", declaredType: "integer" },
  { name: "Quantity", declaredType: "integer" },
];

describe("compareRowSets", () => {
  it("returns equivalent=true for identical row sets", () => {
    const rs: RowSet = { columns: baseColumns, rows: [[1, 10], [2, 20]] };
    const result = compareRowSets(rs, rs);
    expect(result.equivalent).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("detects row count mismatch", () => {
    const a: RowSet = { columns: baseColumns, rows: [[1, 10], [2, 20]] };
    const b: RowSet = { columns: baseColumns, rows: [[1, 10]] };
    const result = compareRowSets(a, b);
    expect(result.equivalent).toBe(false);
    expect(result.findings.some((f) => f.kind === "row-count-mismatch")).toBe(true);
  });

  it("detects value mismatch (int truncate vs round: 2 vs 3 for Quantity=2.5)", () => {
    // SQL Server CAST(2.5 AS int) = 2 (truncate); PostgreSQL 2.5::int = 3 (round)
    const a: RowSet = {
      columns: [{ name: "Quantity", declaredType: "integer" }],
      rows: [[2]],  // SQL Server: truncated
    };
    const b: RowSet = {
      columns: [{ name: "Quantity", declaredType: "integer" }],
      rows: [[3]],  // PostgreSQL naive: rounded
    };
    const result = compareRowSets(a, b);
    expect(result.equivalent).toBe(false);
    expect(result.findings.some((f) => f.kind === "value-mismatch")).toBe(true);
  });

  it("matches column names with spaces correctly", () => {
    const cols = [{ name: "WWI Stock Item Transaction ID", declaredType: "integer" }];
    const a: RowSet = { columns: cols, rows: [[42]] };
    const b: RowSet = { columns: cols, rows: [[42]] };
    const result = compareRowSets(a, b);
    expect(result.equivalent).toBe(true);
  });

  it("detects column name mismatch (different spacing)", () => {
    const a: RowSet = {
      columns: [{ name: "WWI Invoice ID", declaredType: "integer" }],
      rows: [[1]],
    };
    const b: RowSet = {
      columns: [{ name: "WWIInvoiceID", declaredType: "integer" }],  // spaces stripped
      rows: [[1]],
    };
    const result = compareRowSets(a, b);
    expect(result.equivalent).toBe(false);
    expect(result.findings.some((f) => f.kind === "column-name-mismatch")).toBe(true);
  });

  it("returns equivalent=true for null values in both sides", () => {
    const cols = [{ name: "InvoiceID", declaredType: "integer" }];
    const a: RowSet = { columns: cols, rows: [[null]] };
    const b: RowSet = { columns: cols, rows: [[null]] };
    expect(compareRowSets(a, b).equivalent).toBe(true);
  });

  it("detects null vs non-null mismatch", () => {
    const cols = [{ name: "InvoiceID", declaredType: "integer" }];
    const a: RowSet = { columns: cols, rows: [[null]] };
    const b: RowSet = { columns: cols, rows: [[0]] };
    const result = compareRowSets(a, b);
    expect(result.equivalent).toBe(false);
    expect(result.findings.some((f) => f.kind === "value-mismatch")).toBe(true);
  });
});
