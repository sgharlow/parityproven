/**
 * CLI: npm run dispositions
 * Writes a pair record for every object in src/conversions/dispositions.ts with kind "failed": an in-scope object that
 * was not converted. The source comes from the committed inventory (read from SQL Server's own metadata); nothing ran,
 * so steps 1-4 are "not-run" and the record says why. Excluded objects get no pair record (the scorecard lists them).
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { DISPOSITIONS } from "../conversions/dispositions.js";
import type { PairRecord } from "../pairs/schema.js";
import type { InventoryReport } from "../inventory/types.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ASSET_BY_DATABASE: Record<string, string> = {
  WideWorldImporters: "WideWorldImporters-Full.bak",
  AdventureWorks2025: "AdventureWorks2025.bak",
};

function originFor(database: string): Exclude<PairRecord["origin"], "synthetic"> {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, "sources", "manifest.json"), "utf-8")) as {
    entries: Array<{ repo: string; release: string; license: string; assetUrl: string; sha256: string; assetName: string }>;
  };
  const e = manifest.entries.find((x) => x.assetName === ASSET_BY_DATABASE[database]);
  if (!e) throw new Error(`No manifest entry for database ${database}`);
  return { repo: e.repo, release: e.release, license: e.license, assetUrl: e.assetUrl, sha256: e.sha256 };
}

let written = 0;
for (const d of DISPOSITIONS.filter((x) => x.kind === "failed")) {
  const invPath = resolve(ROOT, "inventory", `${d.database}.json`);
  if (!existsSync(invPath)) throw new Error(`inventory/${d.database}.json is missing: run  npm run inventory -- --database ${d.database}`);
  const inv = JSON.parse(readFileSync(invPath, "utf-8")) as InventoryReport;
  const item = inv.objects.find((o) => o.schemaName === d.schema && o.objectName === d.name);
  if (!item) throw new Error(`${d.schema}.${d.name} is not in inventory/${d.database}.json`);
  const label = `${d.schema}.${d.name}`;
  const pairPath = resolve(ROOT, "pairs", d.database, `${label}.json`);
  const previous: PairRecord | null = existsSync(pairPath) ? (JSON.parse(readFileSync(pairPath, "utf-8")) as PairRecord) : null;
  const placeholder = `-- ${label} was not converted.\n-- ${d.reason}\n`;
  const record: PairRecord = {
    origin: originFor(d.database),
    conversionType: "tsql-to-plpgsql",
    objectClass: item.objectClass,
    tier: item.tier,
    code: {
      source: item.definition,
      engineOutput: placeholder,
      final: placeholder,
      diff: "",
      engine: "not converted",
      notes: ["No conversion was attempted, so no harness run exists for this object (steps 1-4 not-run)."],
    },
    columnMappings: [],
    evidence: {
      step1: "not-run", step2: "not-run", step3: "not-run", step4: "not-run", step5: "not-run", step6: "n/a",
      failureDetail: d.reason,
      harnessVersion: "none (not converted)",
    },
    effort: {
      humanMinutes: previous?.effort.humanMinutes ?? 0,
      engineName: "Kiro",
      engineVersion: "not applicable (not converted)",
    },
    status: "failed",
  };
  mkdirSync(dirname(pairPath), { recursive: true });
  writeFileSync(pairPath, JSON.stringify(record, null, 2) + "\n", "utf-8");
  console.log(`pair record written: pairs/${d.database}/${label}.json (not converted, status failed)`);
  written++;
}
console.log(`${written} not-converted record(s); ${DISPOSITIONS.filter((x) => x.kind === "excluded").length} excluded object(s) listed on the scorecard`);
