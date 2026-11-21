/**
 * Checks a draft (the owner's own words) against the generated facts file. Reads and reports; rewrites nothing.
 * Lists every number or commit hash in the draft that the facts file does not contain, and every phrase that
 * claims-and-evidence.md bans.
 */
export const BANNED: Array<[RegExp, string]> = [
  [/behaves? the same/i, "behaves the same"],
  [/100\s?% compatible/i, "100% compatible"],
  [/production[- ]ready/i, "production-ready"],
  [/guarantee[ds]?\b/i, "guaranteed"],
  [/fully automated/i, "fully automated"],
  [/\bproved by\b/i, "proved by"],
];

const DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
const NUMBER = /(?<![\w.])\d+(?:,\d{3})*(?:\.\d+)?(?![\w])/g;
const HASH = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g;
/** 3.0 and 3 are the same figure; 10,958 and 10958 too. */
const norm = (n: string): string => String(Number(n.replace(/,/g, "")));

/** Everything in the facts file that a draft may cite. */
export function citable(facts: string): { numbers: Set<string>; dates: Set<string>; hashes: Set<string> } {
  const dates = new Set(facts.match(DATE) ?? []);
  const body = facts.replace(DATE, " ");
  const hashes = new Set(facts.match(HASH) ?? []);
  const numbers = new Set((body.match(NUMBER) ?? []).map(norm));
  return { numbers, dates, hashes };
}

export interface Finding { line: number; token: string; kind: "number" | "date" | "hash" | "banned"; text: string }

export function checkDraft(draft: string, facts: string): Finding[] {
  const ok = citable(facts);
  const out: Finding[] = [];
  draft.split(/\r?\n/).forEach((line, i) => {
    const at = i + 1;
    const text = line.trim().slice(0, 140);
    for (const [re, name] of BANNED) if (re.test(line)) out.push({ line: at, token: name, kind: "banned", text });
    for (const d of line.match(DATE) ?? []) if (!ok.dates.has(d)) out.push({ line: at, token: d, kind: "date", text });
    for (const h of line.match(HASH) ?? []) if (!ok.hashes.has(h)) out.push({ line: at, token: h, kind: "hash", text });
    const rest = line.replace(DATE, " ").replace(HASH, " ");
    for (const n of rest.match(NUMBER) ?? []) if (!ok.numbers.has(norm(n))) out.push({ line: at, token: n, kind: "number", text });
  });
  return out;
}
