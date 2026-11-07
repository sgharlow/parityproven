/**
 * Expected object counts per database, measured from KIROWEEN-PLAN.md (2026-11-04).
 * These are used as a denominator sanity check only — the live inventory count is authoritative.
 * Update if the live count differs from these values and note the discrepancy.
 */

import type { ObjectClass } from "./types.js";

export const EXPECTED_COUNTS: Record<string, Partial<Record<ObjectClass, number>>> = {
  WideWorldImporters: {
    procedure: 42,
    function:  2,
    view:      3,
    trigger:   0,
  },
  AdventureWorks2025: {
    procedure: 10,
    function:  11,
    view:      20,
    trigger:   10,
  },
};
