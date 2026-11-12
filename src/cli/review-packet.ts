/**
 * CLI: npm run review-packet -- --object <Schema.Name> [--object ...]
 * Writes .tmp/reviews/<db>/<Schema.Name>.md: everything a second reviewer (verification step 5) needs on one page:
 * the original T-SQL, the final PL/pgSQL, the diff from the engine's first draft, what the harness generated and checked,
 * the planted defects it caught, the notes and the checklist from the verification standard, and the exact command that
 * records the review. Nothing is recorded by this command.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import type { PairRecord } from "../pairs/schema.js";
import { missingForVerified } from "../pairs/status.js";
import { specByName } from "../conversions/specs.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const objects = process.argv.flatMap((a, i, all) => (a === "--object" && all[i + 1] ? [all[i + 1]] : []));
if (!objects.length) throw new Error("usage: npm run review-packet -- --object <Schema.Name> [--object ...]");

function firstCommitDate(path: string): string | null {
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--follow", "--format=%cs", "--", path], { cwd: ROOT, encoding: "utf-8" }).trim();
    const lines = out.split("\n").filter(Boolean);
    return lines.length ? lines[lines.length - 1] : null;
  } catch { return null; }
}
const nextDay = (d: string): string => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const fence = (lang: string, text: string): string => "```" + lang + "\n" + text.trimEnd() + "\n```";

for (const object of objects) {
  const db = readdirSync(resolve(ROOT, "pairs")).find((d) => existsSync(resolve(ROOT, "pairs", d, `${object}.json`)));
  if (!db) throw new Error(`no pair record for ${object}`);
  const pairPath = resolve(ROOT, "pairs", db, `${object}.json`);
  const rec = JSON.parse(readFileSync(pairPath, "utf-8")) as PairRecord;
  const spec = specByName(object);
  const e = rec.evidence;
  const first = firstCommitDate(pairPath);
  const earliest = first ? nextDay(first) : "(commit the pair record first)";
  const seed = e.pbtSeeds?.[0];

  const lines: string[] = [
    `# Second review (verification step 5): ${object}`,
    "",
    `Database: ${db} · class: ${rec.objectClass} · tier: ${rec.tier} · status: **${rec.status}**`,
    `First pass committed: ${first ?? "not committed yet"} · earliest review date: **${earliest}**`,
    `Still needed for "verified": ${missingForVerified(e).join(", ") || "nothing"}`,
    "",
    "## Steps as recorded",
    ...([1, 2, 3, 4, 5, 6] as const).map((n) => `- Step ${n}: ${e[`step${n}` as const]}`),
    "",
    "## What the harness checked",
    `- Seed ${seed ?? "-"}: ${e.samplesWithRows ?? "-"} of ${e.samples ?? "-"} generated samples exercised the object; ${e.rowsCompared ?? "-"} rows compared.`,
    `- Traps generated: ${(e.trapsCovered ?? []).join("; ") || "-"}`,
    `- Planted defects caught: ${(e.mutantsDetected ?? []).join("; ") || "-"}`,
    `- Hand-derived fixed cases: ${(spec?.fixedCases ?? []).map((f) => f.label).join("; ") || "none"}`,
    e.runtime ? `- Step 4: PostgreSQL ${e.runtime.postgresMs} ms vs SQL Server ${e.runtime.sqlServerMs} ms = ${e.runtime.ratio}x on ${e.runtime.volume} rows per table.` : "- Step 4: no runtime measurement (see the steps above).",
    e.engineOutputCheck ? `- Engine first draft: ${e.engineOutputCheck.step3}${e.engineOutputCheck.detail ? ` (${e.engineOutputCheck.detail})` : ""}` : "- Engine first draft: none kept separately.",
    seed !== undefined ? `- Re-run: \`npm run convert -- --object ${object} --seed ${seed}\`` : "",
    "",
    "## Agreed tests (step 2)",
    ...(e.testsRun?.length
      ? [
          ...e.testsRun.map((t) => `- ${t}`),
          `- The expected results were captured from the original T-SQL, not derived independently: check each case in \`tests/${db}/${object}.expected.json\` against its label.`,
          `- Re-run: \`npm run agreed-tests -- --object ${object}\``,
        ]
      : ["- Not run yet."]),
    "",
    "## Notes recorded with the conversion",
    ...(rec.code.notes ?? []).map((n) => `- ${n}`),
    "",
    "## Checklist (verification-standard.md)",
    "Tick each line after checking it against the code below, not against the harness result.",
    "- [ ] The conversion does what the T-SQL does for every input the object accepts, not only for the generated ones.",
    "- [ ] NULL versus empty string, including concatenation and ISNULL/COALESCE.",
    "- [ ] Collation and case sensitivity in comparisons, ORDER BY and GROUP BY.",
    "- [ ] Dates and datetime precision (datetime 3.33 ms rounding, datetime2, time zones, boundary dates).",
    "- [ ] Numeric rounding and scale (money, decimal(p,s), integer division, ROUND).",
    "- [ ] Trailing spaces; TOP with and without ties; identity and sequence gaps.",
    "- [ ] Every 'not claimed' statement in the notes is acceptable, and nothing else is silently assumed.",
    "- [ ] The column-type mappings are right for this object.",
    "- [ ] The generated data and fixed cases would catch the mistakes a converter is most likely to make here.",
    ...(e.testsRun?.length ? ["- [ ] Each agreed test's expected result is what its label says the T-SQL should return (they were captured from the source engine)."] : []),
    "",
    "## Record the result",
    `When reviewed (on or after ${earliest}):`,
    "",
    fence("sh", `npm run log-effort -- --object ${object} --review "<your name>" --date <yyyy-mm-dd>\n# if it does not pass:\nnpm run log-effort -- --object ${object} --review "<your name>" --date <yyyy-mm-dd> --fail "<what is wrong>"\n# time spent on this object (adds to the total):\nnpm run log-effort -- --object ${object} --minutes <n>`),
    "",
    "## Original T-SQL",
    fence("sql", rec.code.source),
    "",
    "## Final PL/pgSQL",
    fence("sql", rec.code.final),
    "",
    "## Diff from the engine's first draft",
    rec.code.diff.trim() ? fence("diff", rec.code.diff) : "_No separate first draft (the final text is the engine output)._",
    "",
  ];
  const dir = resolve(ROOT, ".tmp", "reviews", db);
  mkdirSync(dir, { recursive: true });
  const out = resolve(dir, `${object}.md`);
  writeFileSync(out, lines.filter((l) => l !== undefined).join("\n"), "utf-8");
  console.log(`${object}: ${out} (earliest review date ${earliest})`);
}
