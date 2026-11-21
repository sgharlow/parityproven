// Deployed-site check: follows every scorecard link the way a browser would, and checks what the site publishes.
//   npm run site:check -- https://parityproven.com
//
// 1. Loads the scorecard page, runs the page's own same-origin scripts (fetched from the deployed site) against a minimal
//    DOM, and collects the hrefs the page actually builds. No URL is typed into this check.
// 2. Resolves each href against the page URL, as a browser does, requests it, runs that page's scripts with its URL, and
//    fails unless a receipt for that object is rendered.
// 3. From one receipt page, follows "← Scorecard" back and requires the scorecard.
// 4. Requires the site's pages and assets to return 200, and repository files outside the site to return 404.
// Exit code 1 if anything fails. Zero dependencies (node:vm), so it runs from a clean checkout.
import vm from "node:vm";

const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("usage: node scripts/check-site.mjs <deployed base URL, e.g. https://parityproven.com>");
  process.exit(2);
}

const failures = [];
const fail = (msg) => failures.push(msg);

/**
 * fetch with up to 3 attempts on NETWORK errors only (a connect timeout was seen 2026-11-18 midway through ~250 requests).
 * An HTTP status, 404 included, is never retried, so a retry cannot hide a site defect.
 */
async function fetchRetry(url, options) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, options);
    } catch (e) {
      if (attempt >= 3) throw new Error(`network error after ${attempt} attempts: ${url}: ${e.cause?.code ?? e.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function get(url) {
  try {
    const res = await fetchRetry(url, { redirect: "follow" });
    return { status: res.status, url: res.url, text: res.ok ? await res.text() : "" };
  } catch (e) {
    fail(e.message);
    return { status: 0, url, text: "" };
  }
}

/**
 * The site's own same-origin script srcs. External CDN scripts are skipped (the page must work without them), and so are
 * scripts the host injects under /.netlify/ (seen 2026-11-18: /.netlify/scripts/hud), which are not part of the site.
 */
function scriptSrcs(html, pageUrl) {
  return [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
    .map((m) => new URL(m[1], pageUrl))
    .filter((u) => u.origin === new URL(pageUrl).origin && !u.pathname.startsWith("/.netlify/"));
}

/** Runs the page's scripts with location = pageUrl; returns the innerHTML written into the element with rootId. */
async function render(html, pageUrl, rootId) {
  if (!new RegExp(`id="${rootId}"`).test(html)) return { error: `page has no element id="${rootId}"` };
  const root = { innerHTML: "", addEventListener() {} };
  const loc = new URL(pageUrl);
  const document = {
    readyState: "complete",
    title: "",
    getElementById: (id) => (id === rootId ? root : null),
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const context = vm.createContext({
    document,
    location: { href: loc.href, search: loc.search, pathname: loc.pathname, origin: loc.origin },
    fetch: (u, o) => fetchRetry(new URL(u, pageUrl), o),
    URL, URLSearchParams, console, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent, Date,
  });
  for (const src of scriptSrcs(html, pageUrl)) {
    const js = await get(src.href);
    if (js.status !== 200) return { error: `script ${src.pathname} returned ${js.status}` };
    try {
      vm.runInContext(js.text, context, { filename: src.pathname });
    } catch (e) {
      return { error: `script ${src.pathname} threw: ${e.message}` };
    }
  }
  for (let waited = 0; !root.innerHTML && waited < 20000; waited += 100) await new Promise((r) => setTimeout(r, 100));
  return root.innerHTML ? { html: root.innerHTML } : { error: `nothing rendered into #${rootId} within 20 s` };
}

const hrefsIn = (html) => [...html.matchAll(/<a\s[^>]*href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

// ── 1. scorecard: collect the links the page builds ─────────────────────────────────────────────────────────────
const scorecardUrl = `${base}/`;
const scorecard = await get(scorecardUrl);
if (scorecard.status !== 200) fail(`${scorecardUrl} returned ${scorecard.status}`);
const rendered = scorecard.status === 200 ? await render(scorecard.text, scorecardUrl, "scorecard") : { error: "no page" };
if (rendered.error) fail(`scorecard: ${rendered.error}`);
// the first table on the scorecard holds the receipt rows; the excluded / not-attempted tables carry no links
const receiptLinks = rendered.html
  ? hrefsIn(rendered.html.split("</table>")[0]).filter((h) => /[?&]obj=/.test(h))
  : [];
if (rendered.html && receiptLinks.length === 0) fail("scorecard rendered, but it contains no receipt links");

// ── 2. follow every link and require a rendered receipt for that object ─────────────────────────────────────────
const perDatabase = {};
let receiptPageForBackLink;
for (const href of receiptLinks) {
  const target = new URL(href, scorecardUrl); // what a browser does with a click
  const db = target.searchParams.get("db");
  const obj = target.searchParams.get("obj");
  perDatabase[db] ??= { ok: 0, bad: 0 };
  const page = await get(target.href);
  let problem;
  if (page.status !== 200) problem = `${page.status}`;
  else {
    const r = await render(page.text, page.url, "receipt");
    if (r.error) problem = r.error;
    else if (/Receipt not found|Missing parameters/.test(r.html)) problem = "page loaded, but it says the receipt was not found";
    else if (!r.html.includes("<h1") || !r.html.includes(obj.split(".").pop())) problem = `rendered, but not the receipt for ${obj}`;
  }
  if (problem) {
    perDatabase[db].bad++;
    fail(`link "${href}" -> ${target.pathname}${target.search}: ${problem}`);
  } else {
    perDatabase[db].ok++;
    receiptPageForBackLink ??= page;
  }
}

// ── 3. "← Scorecard" from a receipt page goes back to the scorecard ─────────────────────────────────────────────
if (receiptPageForBackLink) {
  const back = hrefsIn(receiptPageForBackLink.text).find((h) => !/^https?:/.test(h) && /Scorecard/.test(
    receiptPageForBackLink.text.slice(receiptPageForBackLink.text.indexOf(`href="${h}"`), receiptPageForBackLink.text.indexOf(`href="${h}"`) + 80)));
  const backUrl = back ? new URL(back, receiptPageForBackLink.url) : undefined;
  if (!backUrl) fail('receipt page has no "Scorecard" link');
  else {
    const b = await get(backUrl.href);
    if (b.status !== 200 || !/id="scorecard"/.test(b.text)) fail(`"Scorecard" link ${backUrl.pathname} did not return the scorecard (${b.status})`);
  }
}

// ── 3b. the Agent Access Map page, reached from the scorecard's own nav link, renders every tool in the map ──────
const mapHref = hrefsIn(scorecard.text).find((h) => /access-map/.test(h));
let mapTools = 0;
if (!mapHref) fail('scorecard has no "Agent Access Map" link');
else {
  const mapUrl = new URL(mapHref, scorecardUrl);
  const page = await get(mapUrl.href);
  const data = await get(new URL("/web/data/agent-access-map.json", scorecardUrl).href);
  if (page.status !== 200) fail(`${mapUrl.pathname} returned ${page.status}`);
  else if (data.status !== 200) fail(`/web/data/agent-access-map.json returned ${data.status}`);
  else {
    const r = await render(page.text, page.url, "access-map");
    const tools = JSON.parse(data.text).exposed.map((e) => e.tool);
    mapTools = tools.length;
    if (r.error) fail(`access map: ${r.error}`);
    else if (/Could not load/.test(r.html)) fail("access map page rendered, but says it could not load the map");
    else for (const t of tools) if (!r.html.includes(t)) fail(`access map page does not show the tool ${t}`);
  }
}

// ── 4. what the site publishes ──────────────────────────────────────────────────────────────────────────────────
const mustServe = ["/", "/receipt", "/about", "/questionnaire", "/access-map", "/receipts/index.json", "/web/app.js", "/web/style.css", "/web/data/agent-access-map.json", "/favicon.ico", "/web/favicon.svg"];
const mustNotServe = ["/src/cli/convert.ts", "/package.json", "/README.md", "/scripts/predeploy-check.mjs",
  "/sources/manifest.json", "/.kiro/steering/product.md", "/pairs/WideWorldImporters/Integration.GetMovementUpdates.json", "/.env"];
for (const p of mustServe) {
  const r = await fetchRetry(base + p).catch((e) => ({ status: e.message }));
  if (r.status !== 200) fail(`${p} returned ${r.status}, expected 200`);
}
for (const p of mustNotServe) {
  const r = await fetchRetry(base + p).catch((e) => ({ status: e.message }));
  if (r.status !== 404) fail(`${p} returned ${r.status}, expected 404 (only the site should be published)`);
}

// head tags on every page (submission-closeout REQ-6.2): a link preview and a favicon need them
let headPages = 0;
for (const p of ["/", "/receipt", "/about", "/questionnaire", "/access-map"]) {
  const r = await get(base + p);
  if (r.status !== 200) continue;   // reported above
  headPages++;
  const html = r.text;
  const need = [
    [/<meta name="description" content="[^"]{20,}"/, "meta description"],
    [/<link rel="icon" href="[^"]+"/, "icon link"],
    [/<meta property="og:title" content="[^"]+"/, "og:title"],
    [/<meta property="og:description" content="[^"]{20,}"/, "og:description"],
    [/<meta property="og:url" content="https?:\/\/[^"]+"/, "og:url"],
  ];
  for (const [re, what] of need) if (!re.test(html)) fail(`${p} has no ${what}`);
}
// ── report ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log(`site check: ${base}  (${new Date().toISOString()})`);
console.log(`scorecard links followed: ${receiptLinks.length}`);
for (const [db, c] of Object.entries(perDatabase)) console.log(`  ${db}: ${c.ok} rendered a receipt, ${c.bad} did not`);
console.log(`agent access map: followed from the scorecard's nav link; ${mapTools} tool(s) from the committed map required on the page`);
console.log(`head tags (description, icon, Open Graph) checked on ${headPages} pages`);
console.log(`pages that must return 200: ${mustServe.length}; repository files that must return 404: ${mustNotServe.length}`);
if (failures.length) {
  console.log(`FAIL: ${failures.length} problem(s)`);
  for (const f of failures.slice(0, 80)) console.log(`  - ${f}`);
  if (failures.length > 80) console.log(`  ... and ${failures.length - 80} more`);
  process.exit(1);
}
console.log("PASS");
