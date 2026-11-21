/**
 * npm run fact-check -- <draft file> [--facts <file>]
 * Lists every number, date or commit hash in the draft that evidence/facts/submission-facts.md does not contain, and every
 * phrase claims-and-evidence.md bans. Rewrites nothing. Exit 1 when it lists anything.
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { checkDraft } from "../facts/fact-check.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const fi = argv.indexOf("--facts");
const factsPath = resolve(fi > -1 ? argv[fi + 1]! : join(ROOT, "evidence", "facts", "submission-facts.md"));
const draftPath = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--facts");
if (!draftPath) { console.error("Usage: fact-check <draft file> [--facts <file>]"); process.exit(2); }
if (!existsSync(factsPath)) { console.error(`facts file not found: ${factsPath} (run: npm run facts)`); process.exit(2); }
if (!existsSync(draftPath)) { console.error(`draft not found: ${draftPath}`); process.exit(2); }

const findings = checkDraft(readFileSync(draftPath, "utf-8"), readFileSync(factsPath, "utf-8"));
console.log(`fact-check: ${draftPath} against ${factsPath}`);
for (const f of findings) {
  const what = f.kind === "banned" ? `banned phrase "${f.token}"` : `${f.kind} ${f.token} is not in the facts file`;
  console.log(`  line ${f.line}: ${what}   | ${f.text}`);
}
console.log(findings.length ? `${findings.length} finding(s). Nothing was changed.` : "no findings");
process.exit(findings.length ? 1 : 0);
