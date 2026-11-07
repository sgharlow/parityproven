/**
 * CLI: npm run inventory -- --database <name> [--out <path>]
 *
 * Inventories all non-system programmable objects in the named SQL Server database,
 * classifies each by type and complexity tier, and writes an InventoryReport to JSON.
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";

import { MssqlClient } from "../harness/clients/mssql-client.js";
import { runInventoryQuery } from "../inventory/query.js";
import { buildReport, formatSummaryTable } from "../inventory/report.js";
import { EXPECTED_COUNTS } from "../inventory/expected-counts.js";
import type { ObjectClass } from "../pairs/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

// Load .env
const envFile = resolve(REPO_ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && match[1] && match[2] !== undefined) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

function parseArgs(): { database: string; out: string } {
  const args = process.argv.slice(2);
  const dbIdx = args.indexOf("--database");
  const outIdx = args.indexOf("--out");

  if (dbIdx === -1 || !args[dbIdx + 1]) {
    console.error("Usage: npm run inventory -- --database <name> [--out <path>]");
    process.exit(1);
  }

  const database = args[dbIdx + 1];
  const defaultOut = resolve(REPO_ROOT, "inventory", `${database}.json`);
  const out = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : defaultOut;

  return { database, out };
}

async function main(): Promise<void> {
  const { database, out } = parseArgs();

  const saPassword = process.env["MSSQL_SA_PASSWORD"];
  if (!saPassword) {
    console.error("ERROR: MSSQL_SA_PASSWORD not set. Copy docker/.env.example to .env.");
    process.exit(1);
  }

  const client = new MssqlClient({
    server: process.env["MSSQL_HOST"] ?? "localhost",
    port: Number(process.env["MSSQL_PORT"] ?? 1433),
    user: "sa",
    password: saPassword,
    database,
  });

  try {
    console.log(`Querying ${database}…`);
    const items = await runInventoryQuery(client, database);
    const report = buildReport(items, database);

    // Compare to expected counts
    const expected = EXPECTED_COUNTS[database];
    if (expected) {
      const classes: ObjectClass[] = ["procedure", "function", "view", "trigger"];
      let mismatch = false;
      for (const cls of classes) {
        const live = report.counts[cls].total;
        const exp = expected[cls] ?? 0;
        if (live !== exp) {
          console.warn(`WARNING: ${cls} count ${live} differs from plan denominator ${exp}`);
          mismatch = true;
        }
      }
      if (mismatch) {
        console.warn("WARNING: counts differ from plan denominator — re-check sys.objects query");
      }
    }

    // Write report
    await mkdir(resolve(REPO_ROOT, "inventory"), { recursive: true });
    await writeFile(out, JSON.stringify(report, null, 2) + "\n", "utf-8");
    console.log(`Report written to ${out}`);

    // Print summary
    console.log("\n" + formatSummaryTable(report));
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
