/**
 * CLI: npm run apply-rulings
 * Applies the project owner's verification rulings of 2026-11-12 to existing pair records, without re-running the
 * harness (the harness writes the same values on its next run):
 *   D6  step 6 is "n/a" for public sample databases;
 *   D4a step 4 is "n/a" for objects that change data (specs with a stateCheck).
 * Status is recomputed by the shared rule (src/pairs/status.ts); a failed record stays failed.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readdirSync, readFileSync, writeFileSync } from "fs";
import type { PairRecord } from "../pairs/schema.js";
import { computeStatus, STEP4_NA_REASON } from "../pairs/status.js";
import { SPECS } from "../conversions/specs.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const stateObjects = new Set(SPECS.filter((s) => s.stateCheck).map((s) => `${s.database}/${s.schema}.${s.name}`));
let changed = 0;

for (const db of readdirSync(resolve(ROOT, "pairs"))) {
  for (const file of readdirSync(resolve(ROOT, "pairs", db)).filter((f) => f.endsWith(".json"))) {
    const path = resolve(ROOT, "pairs", db, file);
    const text = readFileSync(path, "utf-8");
    const rec = JSON.parse(text) as PairRecord;
    const e = rec.evidence;
    if (typeof rec.origin === "object" && e.step6 === "not-run") e.step6 = "n/a";
    if (stateObjects.has(`${db}/${file.replace(/\.json$/, "")}`) && e.step4 === "not-run") {
      e.step4 = "n/a";
      rec.code.notes = [...(rec.code.notes ?? []).filter((n) => !n.startsWith("Step 4 is not run")), STEP4_NA_REASON];
    }
    if (rec.status !== "failed") rec.status = computeStatus(e);
    const out = JSON.stringify(rec, null, 2) + "\n";
    if (out !== text) { writeFileSync(path, out, "utf-8"); changed++; }
  }
}
console.log(`${changed} pair record(s) updated`);
