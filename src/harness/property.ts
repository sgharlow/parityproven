/**
 * Core equivalence property for Integration.GetMovementUpdates.
 *
 * For any generated input:
 *   run(SQL Server, T-SQL procedure) ≡ run(PostgreSQL, PL/pgSQL function)
 *
 * Design requirements (verification-standard.md):
 *  - Each engine is called through its own client only (no symmetric shortcut).
 *  - The comparison covers row count, column names, values, and order.
 *  - Every run records its seed.
 *  - Load-time differences (sub-microsecond truncation) are findings, not failures.
 */

import * as fc from "fast-check";
import type { DatabaseClient } from "./clients/mssql-client.js";
import type { RowSet, Finding } from "./types.js";
import { cutoffPairArb, rowsInWindowArb, ticksToSqlServerString, ticksToPostgresString, hasSubMicrosecondPrecision } from "./generators.js";
import type { StockItemTransactionRow } from "./generators.js";
import { compareRowSets } from "./compare.js";

// SQL Server procedure call
const SS_CALL = `EXEC Integration.GetMovementUpdates @LastCutoff = ?, @NewCutoff = ?`;

// PostgreSQL function call — returns a set of records
const PG_CALL = `SELECT * FROM integration.get_movement_updates($1::timestamp, $2::timestamp)`;

export interface PropertyRunResult {
  seed: number;
  passed: boolean;
  counterexample?: string;
  loadTimeFindings: Finding[];
  rowsCompared: number;
}

export async function runEquivalenceProperty(opts: {
  mssql: DatabaseClient;
  pg: DatabaseClient;
  seed: number;
  numRuns?: number;
  verbose?: boolean;
}): Promise<PropertyRunResult> {
  const { mssql, pg, seed, numRuns = 100, verbose } = opts;
  const log = verbose ? console.log : () => undefined;

  const allLoadTimeFindings: Finding[] = [];
  let totalRowsCompared = 0;
  let counterexample: string | undefined;

  try {
    await fc.assert(
      fc.asyncProperty(
        cutoffPairArb,
        async ({ lastCutoff, newCutoff }) => {
          const rows = await fc.sample(rowsInWindowArb(lastCutoff, newCutoff), { numRuns: 1, seed })[0];
          if (!rows || rows.length === 0) return; // skip empty windows

          const loadFindings: Finding[] = [];

          // Convert rows for each engine
          const ssRows = rows.map((r) => toSsRow(r));
          const pgRows = rows.map((r) => {
            const pgRow = toPgRow(r);
            // Record load-time precision findings
            if (hasSubMicrosecondPrecision(r.LastEditedWhen)) {
              loadFindings.push({
                kind: "load-time-precision-loss",
                detail: `Row StockItemTransactionID=${r.StockItemTransactionID}: LastEditedWhen has sub-microsecond ticks (${r.LastEditedWhen % 10n} extra 100ns units) truncated by PostgreSQL timestamp`,
                columnName: "LastEditedWhen",
              });
            }
            if (hasSubMicrosecondPrecision(r.TransactionOccurredWhen)) {
              loadFindings.push({
                kind: "load-time-precision-loss",
                detail: `Row StockItemTransactionID=${r.StockItemTransactionID}: TransactionOccurredWhen has sub-microsecond ticks truncated by PostgreSQL timestamp`,
                columnName: "TransactionOccurredWhen",
              });
            }
            return pgRow;
          });

          allLoadTimeFindings.push(...loadFindings);

          // Load into both engines independently
          await mssql.loadRows("Warehouse.StockItemTransactions", ssRows);
          await pg.loadRows("warehouse.stock_item_transactions", pgRows);

          const lastCutoffSs = ticksToSqlServerString(lastCutoff);
          const newCutoffSs = ticksToSqlServerString(newCutoff);
          const lastCutoffPg = ticksToPostgresString(lastCutoff);
          const newCutoffPg = ticksToPostgresString(newCutoff);

          // Run each engine through its own client only
          const [ssResult, pgResult] = await Promise.all([
            mssql.query(SS_CALL, [lastCutoffSs, newCutoffSs]),
            pg.query(PG_CALL, [lastCutoffPg, newCutoffPg]),
          ]);

          totalRowsCompared += ssResult.rows.length;

          // Clean up loaded test rows
          const ids = rows.map((r) => r.StockItemTransactionID);
          await cleanupRows(mssql, pg, ids);

          // Compare
          const result = compareRowSets(ssResult, pgResult);
          if (!result.equivalent) {
            const msg = result.findings.map((f) => f.detail).join("\n");
            log(`Mismatch found:\n${msg}`);
            return false;
          }

          return true;
        }
      ),
      { seed, numRuns, verbose: verbose ? 0 : 0 }
    );
  } catch (err) {
    if (err instanceof Error && (err.message.includes("Property failed") || err.constructor.name === "Error")) {
      counterexample = err instanceof Error ? err.message : String(err);
    } else {
      throw err;
    }
  }

  return {
    seed,
    passed: counterexample === undefined,
    counterexample,
    loadTimeFindings: allLoadTimeFindings,
    rowsCompared: totalRowsCompared,
  };
}

// ---------------------------------------------------------------------------
// Row converters
// ---------------------------------------------------------------------------

function toSsRow(r: StockItemTransactionRow): Record<string, unknown> {
  // Truncate datetime2 to microsecond precision so both engines store identical values.
  // Sub-microsecond precision would cause SQL Server to find a row that PostgreSQL misses
  // (because pg truncates on insert). The load-time finding already documents this behaviour.
  const lastEditedWhenTrunc = (r.LastEditedWhen / 10n) * 10n;
  const transOccurredWhenTrunc = (r.TransactionOccurredWhen / 10n) * 10n;
  return {
    StockItemTransactionID: r.StockItemTransactionID,
    StockItemID: r.StockItemID,
    TransactionTypeID: r.TransactionTypeID,
    CustomerID: r.CustomerID,
    InvoiceID: r.InvoiceID,
    SupplierID: r.SupplierID,
    PurchaseOrderID: r.PurchaseOrderID,
    TransactionOccurredWhen: ticksToSqlServerString(transOccurredWhenTrunc),
    Quantity: r.Quantity,
    LastEditedBy: r.LastEditedBy,
    LastEditedWhen: ticksToSqlServerString(lastEditedWhenTrunc),
  };
}

function toPgRow(r: StockItemTransactionRow): Record<string, unknown> {
  return {
    StockItemTransactionID: r.StockItemTransactionID,
    StockItemID: r.StockItemID,
    TransactionTypeID: r.TransactionTypeID,
    CustomerID: r.CustomerID,
    InvoiceID: r.InvoiceID,
    SupplierID: r.SupplierID,
    PurchaseOrderID: r.PurchaseOrderID,
    // Truncate datetime2 columns to microsecond precision for PostgreSQL
    TransactionOccurredWhen: ticksToPostgresString(r.TransactionOccurredWhen),
    Quantity: r.Quantity,
    LastEditedBy: r.LastEditedBy,
    // Also truncate LastEditedWhen — sub-µs values would fall outside the filter window after truncation
    LastEditedWhen: ticksToPostgresString(r.LastEditedWhen),
  };
}

async function cleanupRows(
  mssql: DatabaseClient,
  pg: DatabaseClient,
  ids: number[]
): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map((_, i) => `?`).join(", ");
  await Promise.all([
    mssql.query(
      `DELETE FROM Warehouse.StockItemTransactions WHERE StockItemTransactionID IN (${placeholders})`,
      ids
    ),
    pg.query(
      `DELETE FROM warehouse.stock_item_transactions WHERE "StockItemTransactionID" IN (${placeholders})`,
      ids
    ),
  ]);
}

// Re-export for the defect check
export type { RowSet };
