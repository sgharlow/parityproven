/** Shared types for the harness: result sets, comparisons, findings. */

export interface ColumnMeta {
  name: string;
  /** Declared SQL type as returned by the driver, e.g. "int", "numeric", "timestamp" */
  declaredType: string;
}

export interface RowSet {
  columns: ColumnMeta[];
  rows: unknown[][];
}

export type FindingKind =
  | "load-time-precision-loss"  // value changed when stored (e.g. datetime2 sub-microsecond truncated)
  | "column-type-mismatch"      // same name, different declared type across engines
  | "value-mismatch"            // row/column value differs after type-aware coercion
  | "row-count-mismatch"        // different number of rows returned
  | "column-count-mismatch"     // different number of columns
  | "column-name-mismatch"      // column names differ (case-sensitive, spaces preserved)
  | "order-mismatch";           // same rows but in different order

export interface Finding {
  kind: FindingKind;
  detail: string;
  rowIndex?: number;
  columnName?: string;
  sqlServerValue?: unknown;
  postgresValue?: unknown;
}

export interface CompareResult {
  equivalent: boolean;
  findings: Finding[];
}
