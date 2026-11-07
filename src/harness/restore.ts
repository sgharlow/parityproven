/**
 * WideWorldImporters restore script.
 * Downloads (or uses cached) WideWorldImporters-Full.bak, checks its sha256,
 * copies it into the running mssql container, and runs RESTORE DATABASE.
 *
 * Rules (sources-and-data.md):
 *  - sha256 must match sources/manifest.json before restore is attempted.
 *  - Local cache at %LOCALAPPDATA%\ParityProven\sample-dbs\ is checked first.
 *  - On sha256 mismatch: exit non-zero with a clear message; never restore.
 */

import { createHash } from "crypto";
import { createReadStream, existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import https from "https";
import http from "http";

const execFileAsync = promisify(execFile);

interface ManifestEntry {
  assetName: string;
  assetUrl: string;
  sha256: string;
}

interface Manifest {
  entries: ManifestEntry[];
}

export async function ensureWwiRestored(opts: {
  containerName: string;
  saPassword: string;
  manifestPath: string;
  tmpDir: string;
  verbose?: boolean;
}): Promise<void> {
  const { containerName, saPassword, manifestPath, tmpDir, verbose } = opts;
  const log = verbose ? console.log : () => undefined;

  // 1. Read manifest
  const manifest: Manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
  const entry = manifest.entries.find((e) => e.assetName === "WideWorldImporters-Full.bak");
  if (!entry) throw new Error("Manifest entry for WideWorldImporters-Full.bak not found");

  // 2. Find or download the .bak
  const bakPath = await locateBak(entry, tmpDir, log);

  // 3. Check sha256
  log(`Verifying sha256 for ${bakPath}…`);
  const actual = await sha256File(bakPath);
  if (actual.toLowerCase() !== entry.sha256.toLowerCase()) {
    throw new Error(
      `sha256 mismatch for WideWorldImporters-Full.bak:\n  expected: ${entry.sha256}\n  actual:   ${actual}\nRefusing to restore.`
    );
  }
  log("sha256 verified.");

  // 4. Check if already restored
  const already = await isDatabaseOnline(containerName, saPassword, "WideWorldImporters");
  if (already) {
    log("WideWorldImporters already online in container — skipping restore.");
    return;
  }

  // 5. Copy .bak into container
  const containerBakPath = "/var/opt/mssql/data/WideWorldImporters-Full.bak";
  log(`Copying .bak into container ${containerName}…`);
  await execFileAsync("docker", ["cp", bakPath, `${containerName}:${containerBakPath}`]);

  // 6. RESTORE DATABASE
  log("Running RESTORE DATABASE…");
  const restoreSql = `
RESTORE DATABASE [WideWorldImporters]
FROM DISK = N'${containerBakPath}'
WITH MOVE N'WWI_Primary'          TO N'/var/opt/mssql/data/WideWorldImporters.mdf',
     MOVE N'WWI_UserData'         TO N'/var/opt/mssql/data/WideWorldImporters_UserData.ndf',
     MOVE N'WWI_Log'              TO N'/var/opt/mssql/data/WideWorldImporters_log.ldf',
     MOVE N'WWI_InMemory_Data_1'  TO N'/var/opt/mssql/data/WideWorldImporters_InMemory',
     REPLACE, STATS = 10;
`.trim();

  await runSqlcmd(containerName, saPassword, restoreSql);

  // 7. Verify ONLINE
  const online = await isDatabaseOnline(containerName, saPassword, "WideWorldImporters");
  if (!online) {
    throw new Error("WideWorldImporters is not ONLINE after restore — check container logs.");
  }
  log("WideWorldImporters restored and ONLINE.");
}

async function locateBak(
  entry: ManifestEntry,
  tmpDir: string,
  log: (msg: string) => void
): Promise<string> {
  // Check Windows local cache first
  const localAppData = process.env["LOCALAPPDATA"];
  if (localAppData) {
    const cached = join(localAppData, "ParityProven", "sample-dbs", entry.assetName);
    if (existsSync(cached)) {
      log(`Found cached .bak at ${cached}`);
      return cached;
    }
  }

  // Download
  log(`Downloading ${entry.assetUrl}…`);
  await mkdir(tmpDir, { recursive: true });
  const dest = join(tmpDir, entry.assetName);
  await downloadFile(entry.assetUrl, dest);
  return dest;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    proto.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow one redirect
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode} from ${url}`));
        return;
      }
      pipeline(res, createWriteStream(dest)).then(resolve).catch(reject);
    }).on("error", reject);
  });
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function isDatabaseOnline(
  containerName: string,
  saPassword: string,
  dbName: string
): Promise<boolean> {
  try {
    const query = `SELECT state_desc FROM sys.databases WHERE name = '${dbName}'`;
    const { stdout } = await runSqlcmdQuery(containerName, saPassword, query);
    return stdout.includes("ONLINE");
  } catch {
    return false;
  }
}

async function runSqlcmd(
  containerName: string,
  saPassword: string,
  sqlText: string
): Promise<void> {
  await execFileAsync("docker", [
    "exec", containerName,
    "/opt/mssql-tools18/bin/sqlcmd",
    "-S", "localhost",
    "-U", "sa",
    "-P", saPassword,
    "-No",
    "-Q", sqlText,
  ]);
}

async function runSqlcmdQuery(
  containerName: string,
  saPassword: string,
  query: string
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("docker", [
    "exec", containerName,
    "/opt/mssql-tools18/bin/sqlcmd",
    "-S", "localhost",
    "-U", "sa",
    "-P", saPassword,
    "-No",
    "-Q", query,
    "-h", "-1",
  ]);
}
