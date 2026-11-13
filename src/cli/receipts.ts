/**
 * CLI: npm run receipts:build
 * Builds receipt JSON from pair records, inventory and predictions.
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { buildReceipts } from "../receipts/builder.js";
import { DISPOSITIONS } from "../conversions/dispositions.js";

/**
 * First commit that added each object's pair record or conversion file, keyed "<database>/<schema>.<object>".
 * Read from git so the "converted before the predictions" disclosure is computed, never typed by hand.
 * Fails loudly without git history: a missing disclosure must not look like "none".
 */
function firstCommits(): Record<string, { at: string; commit: string }> {
  let log: string;
  try {
    log = execFileSync("git", ["log", "--diff-filter=A", "--format=@%h %cI", "--name-only", "--", "pairs", "conversions"], {
      cwd: REPO_ROOT, encoding: "utf-8", maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(`receipts:build needs git history to check object commit times against the predictions: ${(err as Error).message}`);
  }
  const out: Record<string, { at: string; commit: string }> = {};
  let current: { at: string; commit: string } | undefined;
  for (const line of log.split(/\r?\n/)) {
    const header = line.match(/^@(\S+) (\S+)$/);
    if (header) { current = { commit: header[1]!, at: new Date(header[2]!).toISOString() }; continue; }
    // pairs/<db>/<Schema>.<Object>.json or conversions/<db>/<Schema>.<Object>[.draft|.naive].sql|.diff
    const file = line.trim().match(/^(?:pairs|conversions)\/([^/]+)\/([^.\/]+)\.([^.\/]+)\.[^\/]+$/);
    if (!file || !current) continue;
    const key = `${file[1]}/${file[2]}.${file[3]}`;
    if (!out[key] || current.at < out[key]!.at) out[key] = current;
  }
  return out;
}

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
    notAttempted: DISPOSITIONS.filter((d) => d.kind === "not-attempted").map((d) => ({
      database: d.database, schemaName: d.schema, objectName: d.name, reason: d.reason,
    })),
    firstCommits: firstCommits(),
  });
  const unexplained = (output.index.notAttempted ?? []).filter((x) => x.reason.startsWith("Not attempted; no reason recorded"));
  for (const x of unexplained) console.warn(`WARNING: ${x.database} ${x.schemaName}.${x.objectName} has no record and no disposition; shown as not attempted`);

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
    `Built ${summary.total} receipt(s) — ${summary.verified} verified, ${summary.pending} pending, ${summary.failed} failed; ${summary.excluded ?? 0} excluded; ${summary.notAttempted ?? 0} not attempted; ${summary.inventory ?? 0} inventoried`
  );
  console.log(`Index: receipts/index.json`);
}

main().catch((err) => { console.error(err); process.exit(1); });
