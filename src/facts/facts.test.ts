import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { computeRecordFacts, embeddedFacts } from "./compute.js";
import { BANNED, checkDraft } from "./fact-check.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FACTS = join(ROOT, "evidence", "facts", "submission-facts.md");

describe("the committed facts file (npm run facts)", () => {
  it("exists and its figures match the records (fails when stale: run npm run facts and commit)", () => {
    expect(existsSync(FACTS)).toBe(true);
    const embedded = embeddedFacts(readFileSync(FACTS, "utf-8"));
    expect(embedded).not.toBeNull();
    expect(embedded).toEqual(JSON.parse(JSON.stringify(computeRecordFacts(ROOT))));
  });
  it("lists a feature as used only with an artifact path that exists", () => {
    for (const f of computeRecordFacts(ROOT).features) {
      if (f.used) expect(f.artifacts.length, f.feature).toBeGreaterThan(0);
      for (const a of f.artifacts) expect(existsSync(join(ROOT, a)), `${f.feature}: ${a}`).toBe(true);
    }
  });
  it("detects a planted stale figure", () => {
    const facts = readFileSync(FACTS, "utf-8");
    const marker = '"verified": ';
    const i = facts.indexOf(marker);
    const planted = facts.slice(0, i + marker.length) + "999" + facts.slice(facts.indexOf(",", i));
    expect(embeddedFacts(planted)).not.toEqual(JSON.parse(JSON.stringify(computeRecordFacts(ROOT))));
  });
});

describe("checkDraft (negative control: a draft with a wrong number and a banned phrase)", () => {
  const facts = "| Verified | 44 / 0 / 11 | x |\nDeadline 2026-12-04 and `4396287`. Factor 1.5x and 3.0x. 10,958 rows.";
  it("accepts numbers, dates and hashes that the facts file holds, with thousands separators", () => {
    expect(checkDraft("44 verified, 11 failed, 10958 rows, due 2026-12-04, at 4396287, factor 1.5x", facts)).toEqual([]);
    expect(checkDraft("10,958 rows", facts)).toEqual([]);
  });
  it("reports a wrong number and a banned phrase, with the line, and changes nothing", () => {
    const draft = "It has 45 verified objects.\nThe result is production-ready and guaranteed.";
    const out = checkDraft(draft, facts);
    expect(out.map((f) => `${f.line}:${f.kind}:${f.token}`)).toEqual(["1:number:45", "2:banned:production-ready", "2:banned:guaranteed"]);
  });
  it("reports a date and a commit hash the facts file does not hold", () => {
    const out = checkDraft("Built 2026-11-03 at abc1234.", facts);
    expect(out.map((f) => f.kind).sort()).toEqual(["date", "hash"]);
  });
  it("bans every phrase the pre-deploy check bans", () => {
    const predeploy = readFileSync(join(ROOT, "scripts", "predeploy-check.mjs"), "utf-8");
    const list = predeploy.match(/const FORBIDDEN = \[(.*)\];/)![1]!;
    for (const phrase of ["behaves the same", "100% compatible", "production-ready", "guaranteed", "fully automated", "proved by"]) {
      expect(list.toLowerCase()).toContain(phrase.split(" ")[0]!.toLowerCase());
      expect(BANNED.some(([re]) => re.test(phrase)), phrase).toBe(true);
    }
  });
});
