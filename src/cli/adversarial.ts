/**
 * CLI (ruling A1, the adversarial gate):
 *   npm run adversarial -- check  --object <Schema.Name> [--dir <dir>]
 *       validation only, no database: cases file against the spec, trap checks, audit file if present
 *   npm run adversarial -- run    --batch <n> | --object <Schema.Name> [--dir <dir>] [--evidence-dir <dir>] [--no-record] [--final-sql <file>]
 *       runs the agent-written cases on both engines (expected values captured from the original T-SQL), the planted-defect
 *       loop on those cases, writes evidence/adversarial/<db>/<obj>.json and sets evidence.adversarial on the pair record
 *       (never steps 1-6). Exit code 1 when any gate fails. One process, objects in sequence.
 *   npm run adversarial -- report --batch <n>
 *       evidence/adversarial/reports/batch-<n>.md from the evidence JSON and pair records
 * --no-record: no pair record is touched and generated tests go under <evidence-dir>/tests (smoke runs and harness checks).
 * --final-sql <file>: deploy that PL/pgSQL instead of conversions/<db>/<obj>.sql (harness check; needs --no-record).
 */

import { resolve, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

import { MssqlClient } from "../harness/clients/mssql-client.js";
import { PgClient } from "../harness/clients/pg-client.js";
import { mssqlEndpoint, pgEndpoint } from "../harness/endpoints.js";
import { ensureAdventureWorksRestored, ensureWwiRestored } from "../harness/restore.js";
import type { Connections } from "../harness/generic/run.js";
import { specByName } from "../conversions/specs.js";
import type { ObjectSpec } from "../harness/generic/spec.js";
import { checkTsqlt, runBatches, runOne, TSQLT_DIR, type Outcome } from "../agreed/runner.js";
import { loadAudit, loadCases } from "../adversarial/load.js";
import { applicableTraps, checkTrap } from "../adversarial/traps.js";
import { buildEvidence } from "../adversarial/evidence.js";
import { buildReport, type ReportItem } from "../adversarial/report.js";
import type { AdversarialEvidence } from "../adversarial/schema.js";
import type { PairRecord } from "../pairs/schema.js";
import { computeStatus } from "../pairs/status.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const HARNESS_VERSION = "adversarial-0.1.0 (harness-generic-0.3.0)";
const BANNER = "-- AGENT-WRITTEN adversarial cases (not hand-derived). Expected results were captured from the original T-SQL.";

const envFile = resolve(ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m?.[1] && m[2] !== undefined) process.env[m[1].trim()] = m[2].trim();
  }
}

const argsOf = (name: string): string[] => process.argv.flatMap((a, i) => (a === name && process.argv[i + 1] ? [process.argv[i + 1]] : []));
const flag = (name: string): boolean => process.argv.includes(name);
const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");
const qualified = (s: ObjectSpec): string => `${s.schema}.${s.name}`;
const rel = (p: string): string => relative(ROOT, p).replace(/\\/g, "/");

/** Objects of a batch from the batches.md table (| # | database | object | ... |). */
function batchObjects(batch: string): string[] {
  const file = resolve(ROOT, ".agents", "tasks", "adversarial-review", "batches.md");
  if (!existsSync(file)) throw new Error(`${rel(file)} not found; use --object instead`);
  const out: string[] = [];
  let inBatch = false;
  for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
    const h = line.match(/^## Batch (\d+)/);
    if (h) { inBatch = h[1] === batch; continue; }
    const row = line.match(/^\|\s*\d+\s*\|\s*[^|]+\|\s*([^|\s]+)\s*\|/);
    if (inBatch && row) out.push(row[1]);
  }
  if (!out.length) throw new Error(`batch ${batch} has no objects in ${rel(file)}`);
  return out;
}

function specOf(name: string): ObjectSpec {
  const s = specByName(name);
  if (!s) throw new Error(`unknown object ${name}`);
  return s;
}

const pairPathOf = (spec: ObjectSpec): string => resolve(ROOT, "pairs", spec.database, `${qualified(spec)}.json`);
const readPair = (spec: ObjectSpec): PairRecord => JSON.parse(readFileSync(pairPathOf(spec), "utf-8")) as PairRecord;

function assertSelectable(spec: ObjectSpec, pair: PairRecord): void {
  const e = pair.evidence;
  const ok = (pair.status === "pending" || pair.status === "verified") && e.step1 === "pass" && e.step2 === "pass" && e.step3 === "pass" && (e.step4 === "pass" || e.step4 === "n/a");
  if (!ok) throw new Error(`${qualified(spec)}: pair record is ${pair.status} (steps 1-4: ${e.step1}/${e.step2}/${e.step3}/${e.step4}); the gate runs only on objects that passed steps 1-4`);
}

function check(name: string, dir?: string): void {
  const spec = specOf(name);
  const base = dir ? resolve(dir) : resolve(ROOT, "adversarial", spec.database);
  const casesPath = resolve(base, `${qualified(spec)}.cases.json`);
  const cases = loadCases(casesPath, spec);
  console.log(`${qualified(spec)}: ${cases.cases.length} cases valid against the spec`);
  const applicable = applicableTraps(spec);
  for (const c of cases.cases) {
    for (const t of c.traps) {
      const r = checkTrap(t, spec, c.fixedCase);
      console.log(`  ${c.id} claims ${t}: ${r.present ? "present" : "ABSENT"} (${r.detail})`);
    }
  }
  for (const [t, a] of Object.entries(applicable)) {
    const covered = cases.cases.some((c) => c.traps.some((x) => x === t && checkTrap(x, spec, c.fixedCase).present));
    const na = cases.notApplicable?.[t as keyof typeof cases.notApplicable];
    console.log(`  trap ${t}: ${a.applicable ? (covered ? "covered" : na ? "not covered; attacker gives a reason" : "NOT COVERED") : `not applicable (${a.why})`}`);
  }
  const auditPath = resolve(base, `${qualified(spec)}.audit.json`);
  if (existsSync(auditPath)) {
    const audit = loadAudit(auditPath, spec);
    console.log(`  audit file valid: ${audit.objections.length} objections, ${audit.casesAudited.length} cases audited`);
  } else console.log("  no audit file yet");
}

async function connect(): Promise<{ conn: Connections; ensure: (db: string) => Promise<void> }> {
  const sa = process.env["MSSQL_SA_PASSWORD"];
  const pgPw = process.env["PG_PASSWORD"];
  if (!sa || !pgPw) throw new Error("MSSQL_SA_PASSWORD and PG_PASSWORD must be set (.env)");
  checkTsqlt();
  const project = process.env["COMPOSE_PROJECT_NAME"] ?? "docker";
  const restoreOpts = { containerName: `${project}-mssql-1`, saPassword: sa, manifestPath: resolve(ROOT, "sources", "manifest.json"), tmpDir: resolve(ROOT, ".tmp") };
  const conn: Connections = {
    saPassword: sa,
    mssqlMaster: new MssqlClient({ ...mssqlEndpoint(), user: "sa", password: sa, database: "master" }),
    pg: new PgClient({ ...pgEndpoint(), user: "postgres", password: pgPw, database: "parityproven" }),
  };
  await runBatches(conn.mssqlMaster, readFileSync(resolve(TSQLT_DIR, "PrepareServer.sql"), "utf-8"), "tSQLt PrepareServer");
  const restored = new Set<string>();
  const ensure = async (db: string): Promise<void> => {
    if (restored.has(db)) return;
    if (db === "AdventureWorks2025") await ensureAdventureWorksRestored(restoreOpts);
    else await ensureWwiRestored(restoreOpts);
    restored.add(db);
  };
  return { conn, ensure };
}

interface RunOpts { dir?: string; evidenceDir: string; record: boolean; finalSqlFile?: string }

async function runObject(conn: Connections, ensure: (db: string) => Promise<void>, name: string, o: RunOpts): Promise<AdversarialEvidence> {
  const spec = specOf(name);
  const label = qualified(spec);
  const pair = readPair(spec);
  if (o.record) assertSelectable(spec, pair);
  const base = o.dir ? resolve(o.dir) : resolve(ROOT, "adversarial", spec.database);
  const casesPath = resolve(base, `${label}.cases.json`);
  const auditPath = resolve(base, `${label}.audit.json`);
  const cases = loadCases(casesPath, spec);
  const audit = loadAudit(auditPath, spec);

  const finalSql = o.finalSqlFile ? readFileSync(resolve(o.finalSqlFile), "utf-8") : undefined;
  const finalSha256 = finalSql !== undefined ? sha256(finalSql) : sha256(pair.code.final);
  if (finalSql === undefined) {
    const onDisk = readFileSync(resolve(ROOT, "conversions", spec.database, `${label}.sql`), "utf-8");
    if (onDisk.trim() !== pair.code.final.trim()) console.log(`WARNING ${label}: conversions/${spec.database}/${label}.sql differs from the pair record's code.final`);
  }

  await ensure(spec.database);
  const adversarialSpec: ObjectSpec = { ...spec, fixedCases: cases.cases.map((c) => ({ ...c.fixedCase, label: `[${c.id}] ${c.label}` })) };
  const outcome: Outcome = await runOne(conn, adversarialSpec, {
    recapture: true, fileTag: ".adversarial", record: false, banner: BANNER, tolerateInvalid: true,
    ...(o.record ? {} : { testsDir: resolve(o.evidenceDir, "tests", spec.database) }),
    ...(finalSql !== undefined ? { finalSql } : {}),
  });

  const evidence = buildEvidence({
    spec, cases, casesFile: { path: rel(casesPath), sha256: sha256(readFileSync(casesPath)) },
    audit, auditFile: { path: rel(auditPath), sha256: sha256(readFileSync(auditPath)) },
    finalSha256, outcome, harnessVersion: HARNESS_VERSION, runAt: new Date().toISOString(),
  });
  const evPath = resolve(o.evidenceDir, spec.database, `${label}.json`);
  mkdirSync(dirname(evPath), { recursive: true });
  writeFileSync(evPath, JSON.stringify(evidence, null, 2) + "\n", "utf-8");
  console.log(`${label}: ${evidence.wording}; mutant adequacy ${evidence.mutantAdequacy.verdict}; gate ${evidence.gate.passed ? "PASS" : "FAIL"}`);
  for (const r of evidence.gate.reasons) console.log(`  - ${r}`);

  if (o.record) {
    pair.evidence.adversarial = {
      gate: evidence.gate.passed ? "pass" : "fail",
      ran: evidence.summary.ran,
      differed: evidence.summary.differed,
      evidencePath: rel(evPath),
      conversionSha256: finalSha256,
      runAt: evidence.runAt,
    };
    pair.status = computeStatus(pair.evidence);
    writeFileSync(pairPathOf(spec), JSON.stringify(pair, null, 2) + "\n", "utf-8");
    console.log(`pair record updated: ${rel(pairPathOf(spec))} (adversarial gate ${pair.evidence.adversarial.gate}, status ${pair.status})`);
  }
  return evidence;
}

async function run(): Promise<boolean> {
  const batch = argsOf("--batch")[0];
  const names = batch ? batchObjects(batch) : argsOf("--object");
  if (!names.length) throw new Error("Usage: adversarial run --batch <n> | --object <Schema.Name> [--dir d] [--evidence-dir d] [--no-record] [--final-sql f]");
  const record = !flag("--no-record");
  const finalSqlFile = argsOf("--final-sql")[0];
  if (finalSqlFile && record) throw new Error("--final-sql needs --no-record");
  if (finalSqlFile && names.length !== 1) throw new Error("--final-sql takes exactly one --object");
  const o: RunOpts = { dir: argsOf("--dir")[0], evidenceDir: resolve(argsOf("--evidence-dir")[0] ?? resolve(ROOT, "evidence", "adversarial")), record, finalSqlFile };
  const statusFile = batch ? resolve(ROOT, "evidence", "adversarial", "status", `batch-${batch}.json`) : undefined;
  const status: { batch: string; startedAt: string; total: number; done: Array<{ object: string; gate: string; wording: string }>; current?: string; finished?: boolean } =
    { batch: batch ?? "", startedAt: new Date().toISOString(), total: names.length, done: [] };
  const writeStatus = (): void => {
    if (!statusFile) return;
    mkdirSync(dirname(statusFile), { recursive: true });
    writeFileSync(statusFile, JSON.stringify(status, null, 2) + "\n", "utf-8");
  };

  const c = await connect();
  let allPass = true;
  try {
    for (const n of names) {
      status.current = n;
      writeStatus();
      try {
        const ev = await runObject(c.conn, c.ensure, n, o);
        allPass = ev.gate.passed && allPass;
        status.done.push({ object: n, gate: ev.gate.passed ? "pass" : "fail", wording: ev.wording });
      } catch (e) {
        allPass = false;
        console.error(`${n}: ${(e as Error).message}`);
        status.done.push({ object: n, gate: "error", wording: (e as Error).message });
      }
      writeStatus();
    }
  } finally {
    status.current = undefined;
    status.finished = true;
    writeStatus();
    await c.conn.mssqlMaster.close();
    await c.conn.pg.close();
  }
  return allPass;
}

function report(): void {
  const batch = argsOf("--batch")[0];
  if (!batch) throw new Error("Usage: adversarial report --batch <n>");
  const items: ReportItem[] = batchObjects(batch).map((name) => {
    const spec = specOf(name);
    const evidencePath = resolve(ROOT, "evidence", "adversarial", spec.database, `${qualified(spec)}.json`);
    if (!existsSync(evidencePath)) throw new Error(`no evidence for ${name}: ${rel(evidencePath)}; run adversarial run first`);
    return { evidence: JSON.parse(readFileSync(evidencePath, "utf-8")) as AdversarialEvidence, pair: readPair(spec), evidencePath: rel(evidencePath) };
  });
  const out = resolve(ROOT, "evidence", "adversarial", "reports", `batch-${batch}.md`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buildReport(batch, items, new Date().toISOString().slice(0, 10)), "utf-8");
  console.log(`report: ${rel(out)}`);
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === "check") {
    const names = argsOf("--object");
    if (!names.length) throw new Error("Usage: adversarial check --object <Schema.Name> [--dir d]");
    for (const n of names) check(n, argsOf("--dir")[0]);
    return;
  }
  if (cmd === "report") return report();
  if (cmd === "run") {
    const ok = await run();
    process.exit(ok ? 0 : 1);
  }
  throw new Error("Usage: adversarial check|run|report ... (see the header of src/cli/adversarial.ts)");
}

main().catch((e) => { console.error(e); process.exit(1); });
