// Fails when a page scrolls sideways (submission-closeout REQ-6.1). Needs Microsoft Edge or Chrome; no npm dependency:
// it starts the browser headless and talks to it over the DevTools protocol with Node's built-in WebSocket.
//   node scripts/check-widths.mjs https://parityproven.com [--widths 1280,1024,768,390]
import { spawn } from "child_process";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) { console.error("Usage: check-widths <base url> [--widths 1280,1024,768,390]"); process.exit(2); }
const wi = process.argv.indexOf("--widths");
const WIDTHS = (wi > -1 ? process.argv[wi + 1] : "1280,1024,768,390").split(",").map(Number);
const PAGES = ["/", "/about", "/questionnaire", "/access-map", "RECEIPT"];

const exe = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].find(existsSync);
if (!exe) { console.error("No Edge or Chrome found: run this check by hand and keep the output in evidence/site-check/."); process.exit(2); }

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "pp-widths-"));
const browser = spawn(exe, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, ms = 15000) {
  const t0 = Date.now();
  for (;;) { try { const v = await fn(); if (v) return v; } catch { /* retry */ } if (Date.now() - t0 > ms) throw new Error("timeout"); await sleep(200); }
}

let id = 0;
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    const waiters = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      else if (m.method) waiters.splice(0).forEach((w) => w(m));
    };
    ws.onerror = reject;
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); }),
      next: (method, ms = 15000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("no " + method)), ms); const f = (m) => { if (m.method === method) { clearTimeout(t); res(m); } else waiters.push(f); }; waiters.push(f); }),
      close: () => ws.close(),
    });
  });
}

let failures = 0;
const lines = [];
try {
  await until(async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).ok);
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  const measure = async (url, width) => {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    const loaded = cdp.next("Page.loadEventFired");
    await cdp.send("Page.navigate", { url });
    await loaded.catch(() => {});
    await sleep(1800);   // the scorecard and receipts render client-side after fetching JSON
    const r = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => { const de = document.documentElement; let worst = 0, who = ""; for (const el of document.body.querySelectorAll("*")) { const b = el.getBoundingClientRect(); if (b.right > worst && b.width > 0) { worst = b.right; who = el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""); } } return { scrollWidth: de.scrollWidth, innerWidth: window.innerWidth, widestRight: Math.round(worst), widest: who, title: document.title, links: [...document.querySelectorAll("a")].map(a => a.href).filter(h => /[?&]obj=/.test(h)).slice(0, 1) }; })()`,
    });
    return r.result.result.value;
  };
  let receiptUrl = null;
  const first = await measure(base + "/", WIDTHS[0]);
  receiptUrl = first.links[0] ?? null;
  for (const p of PAGES) {
    const url = p === "RECEIPT" ? receiptUrl : base + p;
    if (!url) { lines.push(`SKIP ${p}: no receipt link found on the scorecard`); failures++; continue; }
    for (const w of WIDTHS) {
      const v = await measure(url, w);
      const over = v.scrollWidth > v.innerWidth + 1;
      if (over) failures++;
      lines.push(`${over ? "FAIL" : "ok  "} ${String(w).padStart(4)} px  ${url.replace(base, "") || "/"}  scrollWidth ${v.scrollWidth} vs window ${v.innerWidth}${over ? `  (widest element: ${v.widest}, right edge ${v.widestRight})` : ""}`);
    }
  }
  cdp.close();
} catch (e) {
  lines.push(`ERROR ${e.message}`); failures++;
} finally {
  browser.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold files */ }
}
console.log(`width check: ${base} (${new Date().toISOString()}), widths ${WIDTHS.join(", ")}`);
console.log(lines.join("\n"));
console.log(failures ? `FAIL (${failures})` : "PASS");
process.exit(failures ? 1 : 0);
