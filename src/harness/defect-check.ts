/**
 * Planted-defect check (verification-standard.md).
 *
 * A harness that has never been seen failing is not evidence.
 * This check loads rows with fractional Quantity values and confirms that
 * the naive conversion (get_movement_updates_naive, which uses ::int and rounds)
 * produces different results from the T-SQL procedure (which truncates toward zero).
 *
 * If the naive version is NOT detected as wrong, this function throws —
 * the CLI exits non-zero and the real property does not run.
 */

import type { DatabaseClient } from "./clients/mssql-client.js";
import { compareRowSets } from "./compare.js";
import { ticksToSqlServerString, ticksToPostgresString } from "./generators.js";

// Use fixed values to guarantee the fractional trap fires
// Quantity = 2.5: T-SQL CAST truncates to 2; PostgreSQL ::int rounds to 3
const DEFECT_ROWS: Array<Record<string, unknown>> = [
  {
    StockItemTransactionID: 9_000_001,
    StockItemID: 1,
    TransactionTypeID: 1,
    InvoiceID: null,
    SupplierInvoiceNumber: null,
    CustomerID: null,
    PurchaseOrderID: null,
    Quantity: 2.5,
    LastEditedBy: 1,
    LastEditedWhen: "2020-06-15T12:00:01.000",
  },
  {
    StockItemTransactionID: 9_000_002,
    StockItemID: 2,
    TransactionTypeID: 1,
    InvoiceID: null,
    SupplierInvoiceNumber: null,
    CustomerID: null,
    PurchaseOrderID: null,
    Quantity: -2.5,
    LastEditedBy: 1,
    LastEditedWhen: "2020-06-15T12:00:02.000",
  },
];

const LAST_CUTOFF_SS = "2020-06-15T12:00:00.000";
const NEW_CUTOFF_SS = "2020-06-15T12:00:03.000";

const NAIVE_PG_CALL = `SELECT * FROM integration.get_movement_updates_naive($1::timestamp, $2::timestamp)`;
const SS_CALL = `EXEC Integration.GetMovementUpdates @LastCutoff = ?, @NewCutoff = ?`;

export async function runDefectCheck(opts: {
  mssql: DatabaseClient;
  pg: DatabaseClient;
}): Promise<void> {
  const { mssql, pg } = opts;

  // Load the same rows into both engines
  await mssql.loadRows("Warehouse.StockItemTransactions", DEFECT_ROWS);
  await pg.loadRows("warehouse.stock_item_transactions", DEFECT_ROWS);

  try {
    // Run the real T-SQL procedure on SQL Server
    const ssResult = await mssql.query(SS_CALL, [LAST_CUTOFF_SS, NEW_CUTOFF_SS]);

    // Run the NAIVE PostgreSQL function (uses ::int — rounds instead of truncates)
    const pgNaiveResult = await pg.query(NAIVE_PG_CALL, [LAST_CUTOFF_SS, NEW_CUTOFF_SS]);

    const comparison = compareRowSets(ssResult, pgNaiveResult);

    if (comparison.equivalent) {
      throw new Error(
        "Defect check FAILED: naive conversion was not detected as wrong.\n" +
          "The harness cannot be trusted until a known defect is detected.\n" +
          "Check that Quantity = 2.5 rows are present and that the naive function uses ::int."
      );
    }

    // Good — the defect was detected
    const finding = comparison.findings[0];
    console.log(
      `Defect check PASSED: naive conversion detected as wrong. First finding: ${finding?.detail ?? "(see full result)"}`
    );
  } finally {
    // Clean up defect rows from both engines
    const ids = DEFECT_ROWS.map((r) => r.StockItemTransactionID as number);
    const placeholders = ids.map(() => "?").join(", ");
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
}
