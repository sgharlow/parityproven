import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { handTypedFacts } from "./hand-typed.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("handTypedFacts (planted defects: each must be found)", () => {
  it("finds a test count, a verified count, a spec/steering/hook count and a commit hash", () => {
    expect(handTypedFacts("The suite has 257 tests.")).toEqual(["257 tests"]);
    expect(handTypedFacts("44 verified so far")).toEqual(["44 verified"]);
    expect(handTypedFacts("8 steering | 8 specs | 2 hooks")).toEqual(["8 steering", "8 specs", "2 hooks"]);
    expect(handTypedFacts("clone at `62bace8` passed")).toEqual(["`62bace8`"]);
    expect(handTypedFacts("10,953 rows compared")).toEqual(["10,953 rows"]);
  });
  it("ignores the generated status block, the disclosures section, and prose without a count", () => {
    expect(handTypedFacts("a\n<!-- status:start x\n55 receipts, 44 verified\nstatus:end -->\nb")).toEqual([]);
    expect(handTypedFacts("## Pre-existing work and disclosures\n- `a566660`: tech.md\n\n## License\nMIT")).toEqual([]);
    expect(handTypedFacts("## Pre-existing work and disclosures\n- `a566660`: tech.md\n\n## License\n12 tests")).toEqual(["12 tests"]);
    expect(handTypedFacts("steps 1–6, tests run, objects with one result")).toEqual([]);
  });
});

describe("README and steering carry no hand-typed counts or hashes", () => {
  it("outside the generated block", () => {
    const files = ["README.md", ...readdirSync(join(ROOT, ".kiro", "steering")).map((f) => `.kiro/steering/${f}`)];
    const found = files.flatMap((f) => handTypedFacts(readFileSync(join(ROOT, f), "utf-8")).map((h) => `${f}: ${h}`));
    expect(found).toEqual([]);
  });
});
