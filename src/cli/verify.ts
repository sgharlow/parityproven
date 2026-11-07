/**
 * CLI entry point: verify Integration.GetMovementUpdates equivalence.
 *
 * Usage:
 *   npm run verify [-- --seed <n>] [-- --verbose]
 *
 * Sequence:
 *   1. Check both Docker containers are healthy.
 *   2. Restore WideWorldImporters (skipped if already online).
 *   3. Run defect check — exits non-zero if the known defect is not detected.
 *   4. Run the equivalence property.
 *   5. Print seed and pass/fail summary; exit 0 on pass, non-zero on fail.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFile, writeFile } from "fs/promises";

import { MssqlClient } from "../harness/clients/mssql-client.js";
import { PgClient } from "../harness/clients/pg-client.js";
import { ensureWwiRestored } from "../harness/restore.js";
import { runDefectCheck } from "../harness/defect-check.js";
import { runEquivalenceProperty } from "../harness/property.js";
import { parseSeedArg, resolveSeed } from "../harness/seed.js";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const MANIFEST_PATH = resolve(REPO_ROOT, "sources", "manifest.json");
const PAIR_RECORD_PATH = resolve(
  REPO_ROOT,
  "pairs",
  "WideWorldImporters",
  "Integration.GetMovementUpdates.json"
);
const TMP_DIR = resolve(REPO_ROOT, ".tmp");

// Container names as defined in compose.yml (default project = directory name)
const MSSQL_CONTAINER = "parityproven-mssql-1";
const PG_CONTAINER = "parityproven-postgres-1";

const verbose = process.argv.includes("--verbose");
const log = verbose ? console.log : (_: string) => undefined;

async function main(): Promise<void> {
  console.log("ParityProven harness-mvp verify");
  console.log("================================");

  // --- 0. Read config from environment ---
  const saPassword = process.env["MSSQL_SA_PASSWORD"];
  const pgPassword = process.env["PG_PASSWORD"];

  if (!saPassword) {
    die("MSSQL_SA_PASSWORD environment variable is not set. Copy docker/.env.example to .env and fill it in.");
  }
  if (!pgPassword) {
    die("PG_PASSWORD environment variable is not set. Copy docker/.env.example to .env and fill it in.");
  }

  // --- 1. Check containers are healthy ---
  console.log("\n[1/4] Checking Docker containers…");
  await waitForHealthy(MSSQL_CONTAINER, "mssql", 30);
  await waitForHealthy(PG_CONTAINER, "postgres", 30);
  console.log("      Both containers healthy.");

  // --- 2. Restore WideWorldImporters ---
  console.log("\n[2/4] Ensuring WideWorldImporters is restored…");
  await ensureWwiRestored({
    containerName: MSSQL_CONTAINER,
    saPassword,
    manifestPath: MANIFEST_PATH,
    tmpDir: TMP_DIR,
    verbose,
  });

  // --- 3. Create clients ---
  const mssqlClient = new MssqlClient({
    server: "localhost",
    port: 1433,
    user: "sa",
    password: saPassword,
    database: "WideWorldImporters",
  });

  const pgClient = new PgClient({
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: pgPassword,
    database: "parityproven",
  });

  try {
    // --- 4. Defect check ---
    console.log("\n[3/4] Running defect check (naive conversion must be detected)…");
    await runDefectCheck({ mssql: mssqlClient, pg: pgClient });

    // --- 4. Equivalence property ---
    const suppliedSeed = parseSeedArg();
    const seed = resolveSeed(suppliedSeed);
    console.log(`\n[4/4] Running equivalence property (seed: ${seed})…`);

    const result = await runEquivalenceProperty({
      mssql: mssqlClient,
      pg: pgClient,
      seed,
      numRuns: 100,
      verbose,
    });

    // Report load-time findings (informational, not failures)
    if (result.loadTimeFindings.length > 0) {
      console.log(`\n  Load-time findings (${result.loadTimeFindings.length}):`);
      for (const f of result.loadTimeFindings) {
        console.log(`    [${f.kind}] ${f.detail}`);
      }
    }

    if (result.passed) {
      console.log(`\nharness-pbt-green: PASS (seed: ${seed}, rows compared: ${result.rowsCompared})`);

      // Update pair record with step3=pass and seed
      await updatePairRecord(PAIR_RECORD_PATH, seed, result.rowsCompared);

      process.exit(0);
    } else {
      console.error(`\nharness-pbt-green: FAIL (seed: ${seed})`);
      console.error("Counterexample:");
      console.error(result.counterexample);
      console.error(`\nTo reproduce: npm run verify -- --seed ${seed}`);
      process.exit(1);
    }
  } finally {
    await mssqlClient.close();
    await pgClient.close();
  }
}

async function waitForHealthy(
  containerName: string,
  label: string,
  maxWaitSecs: number
): Promise<void> {
  const deadline = Date.now() + maxWaitSecs * 1000;
  while (Date.now() < deadline) {
    try {
      const { stdout } = await execFileAsync("docker", [
        "inspect",
        "--format",
        "{{.State.Health.Status}}",
        containerName,
      ]);
      const status = stdout.trim();
      if (status === "healthy") return;
      log(`  ${label}: ${status} — waiting…`);
    } catch {
      log(`  ${label}: container not found yet — waiting…`);
    }
    await sleep(2000);
  }
  die(
    `Container ${containerName} (${label}) did not become healthy within ${maxWaitSecs}s.\n` +
      `Run: docker compose -f docker/compose.yml up --detach`
  );
}

async function updatePairRecord(
  pairPath: string,
  seed: number,
  rowsCompared: number
): Promise<void> {
  const raw = await readFile(pairPath, "utf-8");
  const record = JSON.parse(raw) as {
    evidence: {
      step3: string;
      pbtSeeds?: number[];
      rowsCompared?: number;
    };
    status: string;
  };
  record.evidence.step3 = "pass";
  record.evidence.pbtSeeds = [...(record.evidence.pbtSeeds ?? []), seed];
  record.evidence.rowsCompared = rowsCompared;
  // Status stays "pending" — full verification requires all 6 steps
  await writeFile(pairPath, JSON.stringify(record, null, 2) + "\n", "utf-8");
  log(`Pair record updated: step3=pass, seed=${seed}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function die(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
