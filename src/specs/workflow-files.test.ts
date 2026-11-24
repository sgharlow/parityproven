import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

/** Part A of the closeout-agent brief: the saved workflow definitions carry no chat text, user paths, e-mail addresses or secrets. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, ".agents", "workflows");

export function problemsIn(text: string): string[] {
  const out: string[] = [];
  if (/originalUserMessages/.test(text)) out.push("carries originalUserMessages (the owner's chat text)");
  if (/C:\\\\?Users|\/Users\/\w+/.test(text)) out.push("contains a user path");
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) out.push("contains an e-mail address");
  if (/password\s*[=:]|api[_-]?key|token\s*[=:]|ghp_|sk-[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{12}/i.test(text)) out.push("looks like it contains a secret");
  if (/postgres(ql)?:\/\/|mssql:\/\/|Server=|Pwd=/i.test(text)) out.push("contains a connection string");
  return out;
}

describe("problemsIn (planted defects: each must be found)", () => {
  it("finds chat text, a user path, an e-mail address, a secret and a connection string", () => {
    expect(problemsIn('{"originalUserMessages": []}')).toHaveLength(1);
    expect(problemsIn("C:\\Users\\someone\\x")).toContain("contains a user path");
    expect(problemsIn("a.b@example.com")).toContain("contains an e-mail address");
    expect(problemsIn("password: hunter2")).toContain("looks like it contains a secret");
    expect(problemsIn("postgresql://u@h/db")).toContain("contains a connection string");
    expect(problemsIn("a workflow definition with steps and agents")).toEqual([]);
  });
});

describe(".agents/workflows", () => {
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".json")).sort() : [];

  it("holds the three runs the README names, and nothing else", () => {
    expect(files).toEqual(["wf_15965d81f6656525.json", "wf_ab80868736ef4504.json", "wf_d4feda0b77ab65fb.json"]);
    const readme = readFileSync(join(ROOT, ".agents", "README.md"), "utf-8");
    for (const f of files) expect(readme).toContain(f.replace(/\.json$/, ""));
  });

  it("are workflow definitions (steps present) with no chat text, user paths, e-mail addresses or secrets", () => {
    for (const f of files) {
      const text = readFileSync(join(DIR, f), "utf-8");
      const def = JSON.parse(text) as { steps?: unknown[] };
      expect(Array.isArray(def.steps), f).toBe(true);
      expect(problemsIn(text), f).toEqual([]);
    }
  });
});
