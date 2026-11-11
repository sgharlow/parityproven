/**
 * CLI: predictions subcommands
 *
 *   npm run predictions:validate -- --database <name>
 *   npm run predictions:score    -- --database <name>
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync, readdirSync } from "fs";

import type { PredictionFile } from "../predictions/schema.js";
import type { InventoryReport } from "../inventory/types.js";
import type { PairRecord } from "../pairs/schema.js";
import { validatePredictions } from "../predictions/validate.js";
import { scorePredictions, formatScoreTable } from "../predictions/score.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

// Load .env
const envFile = resolve(REPO_ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match?.[1] && match[2] !== undefined) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

function parseArgs(): { subcommand: string; database: string } {
  const args = process.argv.slice(2);
  const subcommand = args[0];
  const dbIdx = args.indexOf("--database");

  if (!subcommand || !["validate", "score"].includes(subcommand)) {
    console.error("Usage: node predictions.js <validate|score> --database <name>");
    process.exit(1);
  }
  if (dbIdx === -1 || !args[dbIdx + 1]) {
    console.error("Usage: node predictions.js <validate|score> --database <name>");
    process.exit(1);
  }

  return { subcommand, database: args[dbIdx + 1] };
}

function loadJson<T>(path: string, label: string): T {
  if (!existsSync(path)) {
    console.error(`ERROR: ${label} not found at ${path}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

async function main(): Promise<void> {
  const { subcommand, database } = parseArgs();

  const predPath = resolve(REPO_ROOT, "predictions", `${database}-v1.json`);
  const pred = loadJson<PredictionFile>(predPath, "predictions file");

  if (subcommand === "validate") {
    const inventoryPath = resolve(REPO_ROOT, "inventory", `${database}.json`);
    const report = loadJson<InventoryReport>(inventoryPath, "inventory report");

    const result = validatePredictions(pred, report);

    if (result.warnings.length > 0) {
      for (const w of result.warnings) console.warn(`WARNING: ${w}`);
    }
    if (result.errors.length > 0) {
      for (const e of result.errors) console.error(`ERROR: ${e}`);
      console.error(`\nValidation FAILED (${result.errors.length} error(s))`);
      process.exit(1);
    }

    console.log(`Validation PASSED — ${database}-v1.json is ready to commit.`);
    process.exit(0);
  }

  if (subcommand === "score") {
    const pairsDir = resolve(REPO_ROOT, "pairs", database);
    const pairs: PairRecord[] = [];
    const names: string[] = [];

    if (existsSync(pairsDir)) {
      for (const file of readdirSync(pairsDir)) {
        if (file.endsWith(".json")) {
          pairs.push(loadJson<PairRecord>(resolve(pairsDir, file), file));
          names.push(file.replace(/\.json$/, ""));
        }
      }
    }

    const result = scorePredictions(pred, pairs, names);
    console.log(formatScoreTable(result));
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
