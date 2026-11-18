/**
 * CLI: npm run readme:status            rewrite the README status block from receipts/index.json and pairs/
 *      npm run readme:status -- --check exit 1 if the block is stale or a status count is typed outside it
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { checkReadme, readPairs, statusBlock, writeReadme } from "../receipts/readme-status.js";
import type { ReceiptIndex } from "../receipts/schema.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function updateReadmeStatus(check: boolean): string[] {
  const readmePath = resolve(REPO_ROOT, "README.md");
  const index = JSON.parse(readFileSync(resolve(REPO_ROOT, "receipts", "index.json"), "utf-8")) as ReceiptIndex;
  const block = statusBlock(index, readPairs(resolve(REPO_ROOT, "pairs")));
  const readme = readFileSync(readmePath, "utf-8");
  if (check) return checkReadme(readme, block);
  const next = writeReadme(readme, block);
  if (next !== readme) writeFileSync(readmePath, next, "utf-8");
  return checkReadme(next, block);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const problems = updateReadmeStatus(check);
  for (const p of problems) console.error(`README: ${p}`);
  if (problems.length) process.exit(1);
  console.log(check ? "README status block is current" : "README status block written");
}
