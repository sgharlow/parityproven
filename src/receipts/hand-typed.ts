/**
 * REQ-5.2 (submission-closeout): a count or commit hash typed by hand in README or steering goes stale. This finds them.
 * Allowed: the generated status block, and the README section that cites historical commits (disclosures).
 */
const NOUNS = "tests?|verified|pending|failed|specs?|steering(?:\\s+files?)?|hooks?|commits?|objects?|receipts?|records?|rows";
const COUNT = new RegExp(`(?<![\\d,])\\d+(?:,\\d{3})*\\s+(?:unit\\s+)?(?:${NOUNS})\\b`, "gi");
const HASH = /`[0-9a-f]{7,40}`/g;

export function stripAllowed(text: string): string {
  return text
    .replace(/<!-- status:start[\s\S]*?status:end -->/g, "")
    .replace(/^## Pre-existing work and disclosures[\s\S]*?(?=^## |(?![\s\S]))/m, "");
}

export function handTypedFacts(text: string): string[] {
  const out: string[] = [];
  stripAllowed(text).split(/\r?\n/).forEach((line) => {
    for (const m of line.matchAll(COUNT)) out.push(m[0]);
    for (const m of line.matchAll(HASH)) out.push(m[0]);
  });
  return out;
}
