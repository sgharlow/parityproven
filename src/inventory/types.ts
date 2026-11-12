/** Inventory types. ObjectClass and Tier are defined once in src/pairs/schema.ts. */

export type { ObjectClass, Tier } from "../pairs/schema.js";

import type { ObjectClass, Tier } from "../pairs/schema.js";

export interface InventoryItem {
  schemaName: string;
  objectName: string;
  objectClass: ObjectClass;
  tier: Tier;
  definition: string;
}

export interface TierCounts {
  simple: number;
  medium: number;
  complex: number;
  total: number;
}

export interface InventoryReport {
  database: string;
  generatedAt: string;
  /** Dated changes to the tier rules, so a tier that differs from a committed prediction can be traced. */
  tierRuleChanges?: string[];
  counts: {
    procedure: TierCounts;
    function:  TierCounts;
    view:      TierCounts;
    trigger:   TierCounts;
    total:     number;
  };
  objects: InventoryItem[];
}
