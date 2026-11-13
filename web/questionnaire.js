/**
 * ParityProven questionnaire scan — runs entirely in the browser.
 * No data you enter is sent to or stored on any server; the page only reads /receipts/index.json from this site.
 *
 * Rates come from the committed v1 predictions (predictions/<db>-v1.json, copied into receipts/index.json by
 * npm run receipts:build). No rate is typed into this file. Where both sample databases have a prediction for the same
 * type and tier, the rate is the mean of the two, weighted by object count. Types and tiers with no committed
 * prediction are left out of the estimate and named under the result.
 */

let RATES = null;        // { procedure: { simple: { p50, p90, basis } , ... }, ... }
let RATE_SOURCE = '';

async function loadRates() {
  const res = await fetch('/receipts/index.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const index = await res.json();
  const acc = {};
  const sources = [];
  for (const [db, p] of Object.entries(index.predictions || {})) {
    sources.push(`${db} (committed ${String(p.committedAt).slice(0, 10)})`);
    for (const c of p.cells) {
      const k = acc[c.objectClass] ??= {};
      const cell = k[c.tier] ??= { n: 0, p50: 0, p90: 0 };
      cell.n += c.count; cell.p50 += c.count * c.p50Hours; cell.p90 += c.count * c.p90Hours;
    }
  }
  RATES = {};
  for (const [cls, tiers] of Object.entries(acc)) {
    RATES[cls] = {};
    for (const [tier, c] of Object.entries(tiers)) {
      if (c.n > 0) RATES[cls][tier] = { p50: c.p50 / c.n, p90: c.p90 / c.n };
    }
  }
  const total = Object.values(index.inventory || {}).reduce((a, b) => a + b, 0);
  RATE_SOURCE = `Rates are the committed predictions for ${sources.join(' and ')}, ${total} inventoried objects in all.`;
  const el = document.getElementById('rate-source');
  if (el) el.textContent = RATE_SOURCE;
}
function getVal(id) {
  return parseFloat(document.getElementById(id)?.value ?? '0') || 0;
}

function computeEstimate() {
  const types = ['procedure', 'function', 'view', 'trigger'];
  let totalP50 = 0;
  let totalP90 = 0;
  let totalObjects = 0;
  const unpriced = [];

  for (const t of types) {
    const count = getVal(`count-${t}`);
    if (count <= 0) continue;

    const pctComplex = Math.min(100, Math.max(0, getVal(`pct-complex-${t}`)));
    const pctMedium  = Math.min(100, Math.max(0, getVal(`pct-medium-${t}`)));
    const pctSimple  = Math.max(0, 100 - pctComplex - pctMedium);

    const nComplex = count * pctComplex / 100;
    const nMedium  = count * pctMedium  / 100;
    const nSimple  = count * pctSimple  / 100;

    if (!RATES) return;
    for (const [tier, n] of [['simple', nSimple], ['medium', nMedium], ['complex', nComplex]]) {
      if (n <= 0) continue;
      const r = RATES[t]?.[tier];
      if (!r) { unpriced.push(`${Math.round(n)} ${tier} ${t}${Math.round(n) === 1 ? '' : 's'}`); continue; }
      totalP50 += n * r.p50;
      totalP90 += n * r.p90;
      totalObjects += n;
    }
  }
  const gap = document.getElementById('est-unpriced');
  if (gap) gap.textContent = unpriced.length
    ? `Not in the estimate (no committed prediction for these): ${unpriced.join(', ')}.`
    : '';

  const resultBox = document.getElementById('result');
  if (!resultBox) return;

  if (totalObjects === 0) {
    resultBox.style.display = 'none';
    return;
  }

  resultBox.style.display = 'block';
  document.getElementById('est-p50').textContent = totalP50 < 1
    ? `${Math.round(totalP50 * 60)}min`
    : `${totalP50.toFixed(1)}h`;
  document.getElementById('est-p90').textContent = totalP90 < 1
    ? `${Math.round(totalP90 * 60)}min`
    : `${totalP90.toFixed(1)}h`;
  document.getElementById('est-objects').textContent = Math.round(totalObjects);
}

// Wire up all inputs
document.addEventListener('DOMContentLoaded', () => {
  loadRates().then(computeEstimate).catch((e) => {
    const el = document.getElementById('rate-source');
    if (el) el.textContent = `Could not load the committed predictions (${e.message}), so no estimate can be shown.`;
  });
  document.querySelectorAll('input').forEach(el => {
    el.addEventListener('input', computeEstimate);
  });

  // Sync range + number pairs
  document.querySelectorAll('.range-pair').forEach(pair => {
    const range  = pair.querySelector('input[type="range"]');
    const number = pair.querySelector('input[type="number"]');
    if (!range || !number) return;
    range.addEventListener('input', () => { number.value = range.value; computeEstimate(); });
    number.addEventListener('input', () => { range.value = number.value; computeEstimate(); });
  });
});
