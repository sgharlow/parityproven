/**
 * ParityProven questionnaire scan — runs entirely in the browser.
 * No data is sent to or stored on any server.
 *
 * Rates are derived from the real WideWorldImporters inventory (the only database
 * for which measured data exists). The P50/P90 fields come from predictions once
 * Steve fills them in; until then, sensible defaults are shown with a clear label.
 *
 * NOTE: These rates are judgment-only placeholders. Replace the values in RATES
 * with the actual P50/P90 from predictions/WideWorldImporters-v1.json once committed.
 */

// Tier rates: P50 and P90 hours per object, by objectClass × tier.
// Update these once predictions are committed.
const RATES = {
  procedure: { simple: { p50: 1.0, p90: 2.0 }, medium: { p50: 2.0, p90: 4.0 }, complex: { p50: 6.0, p90: 12.0 } },
  function:  { simple: { p50: 0.5, p90: 1.5 }, medium: { p50: 1.5, p90: 3.0 }, complex: { p50: 4.0, p90: 8.0 } },
  view:      { simple: { p50: 0.5, p90: 1.0 }, medium: { p50: 1.0, p90: 2.0 }, complex: { p50: 3.0, p90: 6.0 } },
  trigger:   { simple: { p50: 1.0, p90: 2.0 }, medium: { p50: 2.0, p90: 4.0 }, complex: { p50: 5.0, p90: 10.0 } },
};

function getVal(id) {
  return parseFloat(document.getElementById(id)?.value ?? '0') || 0;
}

function computeEstimate() {
  const types = ['procedure', 'function', 'view', 'trigger'];
  let totalP50 = 0;
  let totalP90 = 0;
  let totalObjects = 0;

  for (const t of types) {
    const count = getVal(`count-${t}`);
    if (count <= 0) continue;

    const pctComplex = Math.min(100, Math.max(0, getVal(`pct-complex-${t}`)));
    const pctMedium  = Math.min(100, Math.max(0, getVal(`pct-medium-${t}`)));
    const pctSimple  = Math.max(0, 100 - pctComplex - pctMedium);

    const nComplex = count * pctComplex / 100;
    const nMedium  = count * pctMedium  / 100;
    const nSimple  = count * pctSimple  / 100;

    const r = RATES[t];
    totalP50 += nSimple * r.simple.p50 + nMedium * r.medium.p50 + nComplex * r.complex.p50;
    totalP90 += nSimple * r.simple.p90 + nMedium * r.medium.p90 + nComplex * r.complex.p90;
    totalObjects += count;
  }

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
