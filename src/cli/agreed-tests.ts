/**
 * CLI: npm run agreed-tests -- --object <Schema.Name> [--object ...] [--recapture]
 *      npm run agreed-tests -- --object <Schema.Name> --negative-control
 *        runs the tests against a copy of the committed expected results with case 1 corrupted (in memory); it must fail
 *        on both engines while every other case passes. Output: evidence/agreed-controls/<db>/<obj>.txt. Records nothing.
 *
 * Verification step 2 (ruling 2026-11-12): the object's fixed cases as tSQLt tests on SQL Server and plain-SQL assertion
 * tests on PostgreSQL. For each object:
 *   1. fresh scratch database: spec tables + the original T-SQL (unchanged), as for step 3
 *   2. expected results: read tests/<db>/<obj>.expected.json; if it is missing (or --recapture), capture it from the
 *      original T-SQL. A captured file is new evidence and must be reviewed at step 5.
 *   3. generate tests/<db>/<obj>.tsqlt.sql and tests/<db>/<obj>.pg.sql from the spec and the expected file
 *   4. install the pinned tSQLt (scripts/get-tsqlt.ps1) into the scratch database, deploy the tests, tSQLt.RunAll
 *   5. PostgreSQL: spec tables + the final conversion, then every case of the plain-SQL script
 *   6. each planted defect of the conversion is deployed in turn: report which the agreed tests catch (informational;
 *      the harness gate for planted defects is step 3)
 *   7. pair record: evidence.step2 = pass only if every test on both engines passed; evidence.testsRun lists them
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

import { MssqlClient } from "../harness/clients/mssql-client.js";
import { PgClient } from "../harness/clients/pg-client.js";
import { mssqlEndpoint, pgEndpoint } from "../harness/endpoints.js";
import { ensureAdventureWorksRestored, ensureWwiRestored } from "../harness/restore.js";
import type { Connections } from "../harness/generic/run.js";
import { specByName } from "../conversions/specs.js";
import { testName } from "../agreed/generate.js";
import { checkTsqlt, runBatches, runOne, TSQLT_DIR } from "../agreed/runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const envFile = resolve(ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m?.[1] && m[2] !== undefined) process.env[m[1].trim()] = m[2].trim();
  }
}

const argsOf = (name: string): string[] => process.argv.flatMap((a, i) => (a === name && process.argv[i + 1] ? [process.argv[i + 1]] : []));

async function main(): Promise<void> {
  const sa = process.env["MSSQL_SA_PASSWORD"];
  const pgPw = process.env["PG_PASSWORD"];
  if (!sa || !pgPw) throw new Error("MSSQL_SA_PASSWORD and PG_PASSWORD must be set (.env)");
  const names = argsOf("--object");
  const specs = names.map((n) => {
    const s = specByName(n);
    if (!s) throw new Error(`unknown object ${n}`);
    return s;
  });
  if (!specs.length) throw new Error("Usage: agreed-tests --object <Schema.Name> [--object ...] [--recapture | --negative-control]");
  const control = process.argv.includes("--negative-control");
  // --control-column <name>: corrupt that result column (a newly supported type), not the first value of case 1
  const controlColumn = argsOf("--control-column")[0];
  if (controlColumn && !control) throw new Error("--control-column needs --negative-control");
  checkTsqlt();

  const project = process.env["COMPOSE_PROJECT_NAME"] ?? "docker";
  const restoreOpts = {
    containerName: `${project}-mssql-1`, saPassword: sa,
    manifestPath: resolve(ROOT, "sources", "manifest.json"), tmpDir: resolve(ROOT, ".tmp"),
  };
  const conn: Connections = {
    saPassword: sa,
    mssqlMaster: new MssqlClient({ ...mssqlEndpoint(), user: "sa", password: sa, database: "master" }),
    pg: new PgClient({ ...pgEndpoint(), user: "postgres", password: pgPw, database: "parityproven" }),
  };
  let ok = true;
  try {
    // server-level prerequisites for the tSQLt CLR assembly (idempotent)
    await runBatches(conn.mssqlMaster, readFileSync(resolve(TSQLT_DIR, "PrepareServer.sql"), "utf-8"), "tSQLt PrepareServer");
    const restored = new Set<string>();
    for (const spec of specs) {
      if (!restored.has(spec.database)) {
        if (spec.database === "AdventureWorks2025") await ensureAdventureWorksRestored(restoreOpts);
        else await ensureWwiRestored(restoreOpts);
        restored.add(spec.database);
      }
      if (control) {
        const r = await runOne(conn, spec, { control: true, controlColumn });
        const ci = r.controlCase ?? 0;
        const first = testName(ci, spec.fixedCases![ci].label);
        // it must fail as an ASSERTION, not as an error (a truncation error proves nothing about the comparison)
        const assertion = { "SQL Server": /^Failure:/, PostgreSQL: /agreed test failed/ } as const;
        const firstFailed = (engine: "SQL Server" | "PostgreSQL") =>
          r.tests.some((t) => t.engine === engine && t.name === first && !t.passed && assertion[engine].test(t.message ?? ""));
        const othersPassed = r.tests.filter((t) => t.name !== first).every((t) => t.passed);
        const seen = firstFailed("SQL Server") && firstFailed("PostgreSQL") && othersPassed;
        ok = seen && ok;
        const label = `${spec.schema}.${spec.name}`;
        const dir = resolve(ROOT, "evidence", "agreed-controls", spec.database);
        mkdirSync(dir, { recursive: true });
        const evidenceName = controlColumn ? `${label}.${controlColumn}.txt` : `${label}.txt`;
        writeFileSync(resolve(dir, evidenceName), [
          `negative control for ${label} (step 2), ${new Date().toISOString()}`,
          `corruption: ${r.control}`,
          ...r.tests.map((t) => `${t.engine}: ${t.name}: ${t.passed ? "pass" : `FAIL — ${t.message}`}`),
          seen
            ? "RESULT: control seen failing — the corrupted case failed as an assertion on both engines and every other case passed"
            : "RESULT: CONTROL NOT SEEN FAILING — the corrupted case did not fail as an assertion on both engines, or another case failed",
        ].join("\n") + "\n", "utf-8");
        console.log(`${seen ? "control seen failing" : "CONTROL NOT SEEN FAILING"}: evidence/agreed-controls/${spec.database}/${evidenceName}`);
        continue;
      }
      const r = await runOne(conn, spec, { recapture: process.argv.includes("--recapture") });
      ok = r.tests.every((t) => t.passed) && ok;
    }
  } finally {
    await conn.mssqlMaster.close();
    await conn.pg.close();
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
