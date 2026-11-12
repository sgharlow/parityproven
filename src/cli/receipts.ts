/**
 * CLI: npm run receipts:build
 * Builds receipt JSON from pair records, inventory and predictions.
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { buildReceipts } from "../receipts/builder.js";
import { DISPOSITIONS } from "../conversions/dispositions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const envFile = resolve(REPO_ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match?.[1] && match[2] !== undefined) process.env[match[1].trim()] = match[2].trim();
  }
}

async function main(): Promise<void> {
  const output = buildReceipts({
    pairsDir:       resolve(REPO_ROOT, "pairs"),
    inventoryDir:   resolve(REPO_ROOT, "inventory"),
    predictionsDir: resolve(REPO_ROOT, "predictions"),
    exclusions: DISPOSITIONS.filter((d) => d.kind === "excluded").map((d) => ({
      database: d.database, schemaName: d.schema, objectName: d.name, reason: d.reason,
    })),
  });

  // Write receipt files
  for (const receipt of output.receipts) {
    const dir = resolve(REPO_ROOT, "receipts", receipt.database);
    mkdirSync(dir, { recursive: true });
    const path = resolve(dir, `${receipt.schemaName}.${receipt.objectName}.json`);
    writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n", "utf-8");
  }

  // Write index
  const indexPath = resolve(REPO_ROOT, "receipts", "index.json");
  writeFileSync(indexPath, JSON.stringify(output.index, null, 2) + "\n", "utf-8");

  const { summary } = output.index;
  console.log(
    `Built ${summary.total} receipt(s) — ${summary.verified} verified, ${summary.pending} pending, ${summary.failed} failed; ${summary.excluded ?? 0} excluded`
  );
  console.log(`Index: receipts/index.json`);
}

main().catch((err) => { console.error(err); process.exit(1); });
