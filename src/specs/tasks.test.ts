import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

/** REQ-2.2 (submission-closeout): a task list cannot drift. An open box needs an "open because" note on its own line. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function openBoxesWithoutNote(text: string): string[] {
  return text.split(/\r?\n/).filter((l) => /^\s*- \[ \]/.test(l) && !/open because/i.test(l)).map((l) => l.trim());
}

describe("tasks.md files under .kiro/specs", () => {
  it("flags an open box with no note, and accepts one with a note and a ticked box", () => {
    expect(openBoxesWithoutNote("- [ ] 1. do it")).toEqual(["- [ ] 1. do it"]);
    expect(openBoxesWithoutNote("- [ ] 1. do it (open because: waits for the owner)")).toEqual([]);
    expect(openBoxesWithoutNote("- [x] 1. done (abc1234)")).toEqual([]);
    expect(openBoxesWithoutNote("  - [ ] nested, no note")).toHaveLength(1);
  });

  it("has an 'open because' note on every open box in every spec", () => {
    const specs = join(ROOT, ".kiro", "specs");
    expect(existsSync(specs)).toBe(true);
    const problems: string[] = [];
    for (const d of readdirSync(specs)) {
      const f = join(specs, d, "tasks.md");
      if (!existsSync(f)) continue;
      for (const line of openBoxesWithoutNote(readFileSync(f, "utf-8"))) problems.push(`${d}/tasks.md: ${line.slice(0, 90)}`);
    }
    expect(problems).toEqual([]);
  });
});
