/**
 * fast-check arbitraries for the WideWorldImporters harness.
 * Biased toward traps documented in wwi-inventory-2026-11-06.md:
 *  - Fractional Quantity values (expose CAST-vs-TRUNC difference)
 *  - NULL in nullable ID columns
 *  - datetime2(7) values with sub-microsecond precision near cutoff boundaries
 */

import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// datetime2 helpers
// A datetime2(7) tick is 100 ns (0.0001 ms).
// PostgreSQL timestamp has 1 µs (0.001 ms) resolution.
// We represent instants as BigInt counts of 100ns ticks from the Unix epoch.
// ---------------------------------------------------------------------------

/** Smallest representable datetime2(7) value: 0001-01-01 00:00:00.0000000 */
const MIN_DATETIME2_TICKS = 946_684_800_000_0000n;   // 2000-01-01 UTC in 100ns ticks from Unix epoch
/** Representative safe max: 2049-12-31 23:59:59 */
const MAX_DATETIME2_TICKS = 2_524_607_999_000_0000n;

/** 1 microsecond in 100ns ticks */
const TICKS_PER_MICROSECOND = 10n;

/** Convert a 100ns tick count (from a reference epoch) to an ISO-like string
 *  with 7 decimal places for SQL Server, or 6 for PostgreSQL.
 */
export function ticksToSqlServerString(ticks: bigint): string {
  const ms = Number(ticks / 10000n);
  const subMs = Number(ticks % 10000n);  // remaining 100ns units within the millisecond
  const d = new Date(ms);
  const iso = d.toISOString().replace("Z", "");
  // Replace the 3-digit ms part with 7-digit fractional seconds
  const fractional = (subMs).toString().padStart(4, "0");
  return iso.replace(/\.\d{3}$/, `.${d.getMilliseconds().toString().padStart(3, "0")}${fractional}`);
}

export function ticksToPostgresString(ticks: bigint): string {
  // Truncate to microsecond precision
  const truncated = (ticks / TICKS_PER_MICROSECOND) * TICKS_PER_MICROSECOND;
  const ms = Number(truncated / 10000n);
  const subMs = Number(truncated % 10000n);
  const d = new Date(ms);
  const iso = d.toISOString().replace("Z", "");
  const fractional = subMs.toString().padStart(4, "0");
  return iso.replace(/\.\d{3}$/, `.${d.getMilliseconds().toString().padStart(3, "0")}${fractional.slice(0, 3)}`);
}

/** Returns true if the tick value has sub-microsecond precision that PostgreSQL will truncate. */
export function hasSubMicrosecondPrecision(ticks: bigint): boolean {
  return ticks % TICKS_PER_MICROSECOND !== 0n;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for 100ns tick counts, biased toward sub-microsecond boundary values. */
export const datetime2TicksArb: fc.Arbitrary<bigint> = fc.oneof(
  { arbitrary: fc.bigInt({ min: MIN_DATETIME2_TICKS, max: MAX_DATETIME2_TICKS }).map(
      (t) => (t / TICKS_PER_MICROSECOND) * TICKS_PER_MICROSECOND
    ), weight: 3 },
  // Sub-microsecond: 1–9 ticks past a microsecond boundary
  { arbitrary: fc.bigInt({ min: MIN_DATETIME2_TICKS, max: MAX_DATETIME2_TICKS }).map(
      (t) => {
        const base = (t / TICKS_PER_MICROSECOND) * TICKS_PER_MICROSECOND;
        const sub = (t % 9n) + 1n;
        return base + sub;
      }
    ), weight: 1 }
);

/** Cutoff pair: two tick values with lastCutoff < newCutoff, biased to be close. */
export const cutoffPairArb: fc.Arbitrary<{ lastCutoff: bigint; newCutoff: bigint }> =
  fc.bigInt({ min: MIN_DATETIME2_TICKS, max: MAX_DATETIME2_TICKS - 1_000_000n })
    .chain((last) => {
      // Gap: between 1 tick and ~1 second (10,000,000 ticks)
      const gapArb = fc.oneof(
        fc.bigInt({ min: 1n, max: 100n }),          // sub-microsecond gap: boundary stress
        fc.bigInt({ min: 10n, max: 1_000_000n })    // normal range
      );
      return gapArb.map((gap) => ({ lastCutoff: last, newCutoff: last + gap }));
    });

/** Quantity: numeric(18,3), biased toward fractional values that expose TRUNC vs ROUND. */
export const quantityArb: fc.Arbitrary<number> = fc.oneof(
  // Fractional values that differ between ::int (round) and TRUNC (truncate)
  { arbitrary: fc.constantFrom(2.5, -2.5, 0.999, -0.999, 1.5, -1.5, 3.5, -3.5, 0.001, -0.001), weight: 3 },
  // Integers (no difference)
  { arbitrary: fc.integer({ min: -9999, max: 9999 }).map((n) => n), weight: 1 },
  // Arbitrary 3-decimal values
  { arbitrary: fc.float({ min: -99999, max: 99999, noNaN: true }).map(
      (f) => Math.round(f * 1000) / 1000
    ), weight: 1 }
);

/** Nullable integer (NULL ~25% of the time). */
export const nullableIntArb: fc.Arbitrary<number | null> = fc.option(
  fc.integer({ min: 1, max: 999999 }),
  { nil: null, freq: 3 }
);

/** A full row for warehouse.stock_item_transactions (MEASURED schema 2026-11-06). */
export interface StockItemTransactionRow {
  StockItemTransactionID: number;
  StockItemID: number;
  TransactionTypeID: number;
  CustomerID: number | null;
  InvoiceID: number | null;
  SupplierID: number | null;
  PurchaseOrderID: number | null;
  TransactionOccurredWhen: bigint;  // 100ns ticks
  Quantity: number;
  LastEditedBy: number;
  LastEditedWhen: bigint;  // 100ns ticks — the filter column
}

let _idCounter = 1_000_000;  // Start high to avoid colliding with real data

export const stockItemTransactionRowArb: fc.Arbitrary<StockItemTransactionRow> = fc.record({
  StockItemTransactionID: fc.constant(0).map(() => ++_idCounter),  // unique ascending
  StockItemID: fc.integer({ min: 1, max: 227 }),
  TransactionTypeID: fc.integer({ min: 1, max: 13 }),
  CustomerID: fc.constant(null),   // FK to Sales.Customers — use NULL to avoid FK violations
  InvoiceID: fc.constant(null),    // FK to Sales.Invoices
  SupplierID: fc.constant(null),   // FK to Purchasing.Suppliers
  PurchaseOrderID: fc.constant(null), // FK to Purchasing.PurchaseOrders
  TransactionOccurredWhen: datetime2TicksArb,
  Quantity: quantityArb,
  LastEditedBy: fc.integer({ min: 1, max: 20 }),
  LastEditedWhen: datetime2TicksArb,
});

/** Multiple rows whose LastEditedWhen values fall between lastCutoff and newCutoff (inclusive of the upper bound, exclusive of the lower). */
export function rowsInWindowArb(
  lastCutoff: bigint,
  newCutoff: bigint
): fc.Arbitrary<StockItemTransactionRow[]> {
  const windowSize = newCutoff - lastCutoff;
  if (windowSize <= 0n) return fc.constant([]);

  const inWindowRowArb = stockItemTransactionRowArb.map((row) => ({
    ...row,
    // Place LastEditedWhen strictly within (lastCutoff, newCutoff]
    LastEditedWhen: lastCutoff + 1n + (row.LastEditedWhen % windowSize),
  }));

  return fc.array(inWindowRowArb, { minLength: 1, maxLength: 10 });
}
