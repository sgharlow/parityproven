/**
 * README status block: every status figure the README shows is generated here from receipts/index.json and pairs/,
 * never typed by hand (claims-and-evidence.md, "Numbers in the UI"). `checkReadme` fails when the block is stale or when
 * a hand-typed object count appears outside it, and runs in `npm test` (readme-status.test.ts).
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import type { PairRecord } from "../pairs/schema.js";
import type { ReceiptIndex } from "./schema.js";

export const BLOCK_START = "<!-- status:start (generated from receipts/index.json and pairs/ by npm run readme:status; do not edit) -->";
export const BLOCK_END = "<!-- status:end -->";

export interface NamedPair { database: string; object: string; record: PairRecord }

export function readPairs(pairsDir: string): NamedPair[] {
  if (!existsSync(pairsDir)) return [];
  return readdirSync(pairsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) =>
    readdirSync(join(pairsDir, d.name)).filter((f) => f.endsWith(".json")).sort().map((f) => ({
      database: d.name,
      object: f.replace(/\.json$/, ""),
      record: JSON.parse(readFileSync(join(pairsDir, d.name, f), "utf-8")) as PairRecord,
    })));
}

const list = (xs: string[]) => (xs.length ? xs.map((x) => `\`${x}\``).join(", ") : "none");

/** The block's text (between and including the markers). Pure: same inputs, same text. */
export function statusBlock(index: ReceiptIndex, pairs: NamedPair[]): string {
  const s = index.summary;
  const dbs = Object.keys(index.inventory ?? {}).sort();
  const perDb = dbs.map((db) => `${db} ${index.inventory![db]}`).join(", ");
  const receiptsPerDb = dbs.map((db) => `${db} ${index.receipts.filter((r) => r.database === db).length}`).join(", ");
  const converted = pairs.filter((p) => p.record.code.engine !== "not converted");
  const step2 = pairs.filter((p) => p.record.evidence.step2 === "pass").map((p) => p.object);
  const step5 = pairs.filter((p) => p.record.evidence.step5 === "pass");
  const reviewed = [...new Set(step5.map((p) => `${p.record.evidence.reviewer ?? "?"} on ${p.record.evidence.reviewDate ?? "?"}`))];
  const verified = pairs.filter((p) => p.record.status === "verified").map((p) => p.object);
  return [
    BLOCK_START,
    `- Inventoried: ${s.inventory ?? 0} programmable objects (${perDb}).`,
    `- On the scorecard: ${s.total} receipts (${receiptsPerDb}): **${s.verified} verified**, ${s.pending} pending, ${s.failed} failed. ` +
      `A further ${s.excluded ?? 0} are excluded as out of scope and ${s.notAttempted ?? 0} are not attempted, each with its reason.`,
    `- Converted and run through the harness: ${converted.length} objects (the other ${pairs.length - converted.length} pair records are recorded as failed without a conversion).`,
    `- Step 2 (agreed tests) passes for ${step2.length}: ${list(step2)}.`,
    `- Step 5 (sign-off by a named person) recorded for ${step5.length}${reviewed.length ? ` (${reviewed.join("; ")})` : ""}. Verified: ${list(verified)}.`,
    `- Receipts built ${index.builtAt}.`,
    BLOCK_END,
  ].join("\n");
}

// A count of objects or statuses typed outside the block goes stale silently (README line 79, seen 2026-11-17).
const NUMBER = "\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty";
const HAND_TYPED_COUNT = new RegExp(`\\b(${NUMBER})\\s+(objects?|receipts?|pair records?|verified|pending|failed)\\b|\\b(no|every|all)\\s+objects?\\s+(is|are)\\s+verified\\b|\\bno object is verified\\b`, "gi");

/** Problems with the README; empty when it is current. */
export function checkReadme(readme: string, expectedBlock: string): string[] {
  const problems: string[] = [];
  const start = readme.indexOf(BLOCK_START);
  const end = readme.indexOf(BLOCK_END);
  if (start < 0 || end < start) {
    problems.push("README has no generated status block (markers missing)");
  } else if (readme.slice(start, end + BLOCK_END.length) !== expectedBlock) {
    problems.push("README status block is stale: run  npm run readme:status");
  }
  const outside = start >= 0 && end > start ? readme.slice(0, start) + readme.slice(end + BLOCK_END.length) : readme;
  outside.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(HAND_TYPED_COUNT)) problems.push(`hand-typed status outside the block: "${m[0]}" in: ${line.trim().slice(0, 120)}`);
    void i;
  });
  return problems;
}

/** README with the block replaced (or the markers must already exist). */
export function writeReadme(readme: string, block: string): string {
  const start = readme.indexOf(BLOCK_START);
  const end = readme.indexOf(BLOCK_END);
  if (start < 0 || end < start) throw new Error("README has no status block markers; add them where the status should appear");
  return readme.slice(0, start) + block + readme.slice(end + BLOCK_END.length);
}
