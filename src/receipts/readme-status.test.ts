import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { BLOCK_END, BLOCK_START, checkReadme, readPairs, statusBlock } from "./readme-status.js";
import type { ReceiptIndex } from "./schema.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const index = JSON.parse(readFileSync(resolve(REPO_ROOT, "receipts", "index.json"), "utf-8")) as ReceiptIndex;
const pairs = readPairs(resolve(REPO_ROOT, "pairs"));
const block = statusBlock(index, pairs);

describe("README status", () => {
  it("the committed README agrees with receipts/index.json and pairs/ (run npm run readme:status if this fails)", () => {
    expect(checkReadme(readFileSync(resolve(REPO_ROOT, "README.md"), "utf-8"), block)).toEqual([]);
  });

  it("the block's counts are the index's counts", () => {
    expect(block).toContain(`**${index.summary.verified} verified**, ${index.summary.pending} pending, ${index.summary.failed} failed`);
    expect(block.startsWith(BLOCK_START) && block.endsWith(BLOCK_END)).toBe(true);
  });

  it("fails on a stale block", () => {
    const stale = `# x\n${block.replace(`**${index.summary.verified} verified**`, `**${index.summary.verified + 1} verified**`)}\n`;
    expect(checkReadme(stale, block)).toContain("README status block is stale: run  npm run readme:status");
  });

  it("fails on a hand-typed status outside the block, including the sentence that went stale on 2026-11-16", () => {
    const readme = `${block}\nStep 2 has run for seven objects so far. No second review is recorded yet, so no object is verified today.\n`;
    const problems = checkReadme(readme, block);
    expect(problems.some((p) => p.includes('"seven objects"'))).toBe(true);
    expect(problems.some((p) => p.includes('"no object is verified"'))).toBe(true);
  });

  it("fails when the markers are missing", () => {
    expect(checkReadme("# no block\n", block)).toContain("README has no generated status block (markers missing)");
  });
});
