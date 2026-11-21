// Adds the favicon link, meta description and Open Graph tags to every page in web/ (idempotent).
// Descriptions are plain statements of what each page holds. No og:image: an image would carry numbers that can go stale
// (submission-closeout REQ-6.2 allows "none").   node scripts/add-head-tags.mjs
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
const SITE = "https://parityproven.com";
const PAGES = {
  "index.html": ["/", "T-SQL to PL/pgSQL conversions, each checked by property-based equivalence tests against the original on SQL Server. Every receipt gives the command that re-runs its check from the repo."],
  "about.html": ["/about", "About ParityProven: the six-step verification standard, the public sample data it uses, and its disclosures."],
  "questionnaire.html": ["/questionnaire", "A questionnaire that scores a SQL Server estate's migration complexity in the browser. Answers are not sent anywhere."],
  "access-map.html": ["/access-map", "What an AI agent may read from a database through the project's read-only MCP server, and what it may not. Rendered from the committed access map."],
  "receipt.html": ["/receipt", "One migration receipt: the original T-SQL, the PL/pgSQL conversion, the diff, the six verification steps and the command that re-runs the check."],
};
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

for (const [file, [path, desc]] of Object.entries(PAGES)) {
  const p = join(WEB, file);
  let html = readFileSync(p, "utf-8");
  const title = (html.match(/<title>([^<]*)<\/title>/) ?? [])[1];
  if (!title) throw new Error(`${file}: no <title>`);
  html = html.replace(/\r?\n[ \t]*<!-- head-tags:start -->[\s\S]*?<!-- head-tags:end -->/, "");
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  const block = [
    "  <!-- head-tags:start (scripts/add-head-tags.mjs) -->",
    `  <meta name="description" content="${esc(desc)}">`,
    `  <link rel="icon" href="/web/favicon.svg" type="image/svg+xml">`,
    `  <meta property="og:type" content="website">`,
    `  <meta property="og:site_name" content="ParityProven">`,
    `  <meta property="og:title" content="${esc(title)}">`,
    `  <meta property="og:description" content="${esc(desc)}">`,
    `  <meta property="og:url" content="${SITE}${path === "/" ? "/" : path}">`,
    `  <meta name="twitter:card" content="summary">`,
    "  <!-- head-tags:end -->",
  ].join(nl);
  html = html.replace(/(<title>[^<]*<\/title>)/, `$1${nl}${block}`);
  writeFileSync(p, html);
  console.log("tagged", file);
}
