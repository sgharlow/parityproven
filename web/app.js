/* ParityProven — shared JS for scorecard (index.html) and receipt (receipt.html) */

// ─── Utilities ────────────────────────────────────────────────────────────────

function statusBadge(status) {
  const map = {
    verified: ['badge-verified', '✅ Verified'],
    pending:  ['badge-pending',  '⏳ Pending'],
    failed:   ['badge-failed',   '❌ Failed'],
    pass:     ['badge-pass',     'Pass'],
    fail:     ['badge-fail',     'Fail'],
    'not-run':['badge-not-run',  'Not run'],
    'n/a':    ['badge-na',       'N/A'],
  };
  const [cls, label] = map[status] || ['badge-not-run', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Scorecard (index.html) ───────────────────────────────────────────────────

async function initScorecard() {
  const root = document.getElementById('scorecard');
  if (!root) return;

  let index;
  try {
    const res = await fetch('/receipts/index.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    index = await res.json();
  } catch (e) {
    root.innerHTML = `<div class="empty"><h2>Could not load receipts</h2><p>${esc(e.message)}</p></div>`;
    return;
  }

  if (!index.receipts || index.receipts.length === 0) {
    root.innerHTML = `
      <div class="empty">
        <h2>No conversions yet</h2>
        <p>Predictions committed. Conversion work in progress.</p>
      </div>`;
    return;
  }

  const { summary } = index;
  const statsHtml = `
    <div class="stats">
      <div class="stat stat-verified"><div class="stat-val">${summary.verified}</div><div class="stat-lbl">Verified</div></div>
      <div class="stat stat-pending"> <div class="stat-val">${summary.pending}</div> <div class="stat-lbl">Pending</div></div>
      <div class="stat stat-failed">  <div class="stat-val">${summary.failed}</div>  <div class="stat-lbl">Failed</div></div>
      <div class="stat">              <div class="stat-val">${summary.total}</div>   <div class="stat-lbl">Total</div></div>
      ${summary.excluded ? `<div class="stat"><div class="stat-val">${summary.excluded}</div><div class="stat-lbl">Out of scope</div></div>` : ''}
      ${summary.notAttempted ? `<div class="stat"><div class="stat-val">${summary.notAttempted}</div><div class="stat-lbl">Not attempted</div></div>` : ''}
      ${summary.inventory ? `<div class="stat"><div class="stat-val">${summary.inventory}</div><div class="stat-lbl">Inventoried</div></div>` : ''}
    </div>`;

  const scoreNotes = [...(index.predictionNotes || []), ...(index.tierNotes || [])];
  const tierNotesHtml = scoreNotes.length
    ? `<div class="card" style="font-size:0.85rem;color:var(--c-muted)">${scoreNotes.map(n => `<p style="margin:0.25rem 0">${esc(n)}</p>`).join('')}</div>`
    : '';

  const rows = index.receipts.map(r => {
    const link = `receipt.html?db=${encodeURIComponent(r.database)}&obj=${encodeURIComponent(r.schemaName + '.' + r.objectName)}`;
    return `<tr>
      <td><a href="${link}">${esc(r.schemaName)}.${esc(r.objectName)}</a></td>
      <td>${esc(r.database)}</td>
      <td><span class="chip">${esc(r.objectClass)}</span></td>
      <td><span class="chip">${esc(r.tier)}</span></td>
      <td>${statusBadge(r.status)}</td>
    </tr>`;
  }).join('');

  const excluded = index.excluded || [];
  const excludedHtml = excluded.length
    ? `<h2 style="margin-top:2rem">Not converted: out of scope (${excluded.length})</h2>
       <p style="color:var(--c-muted);font-size:0.875rem">These objects are in the inventory but were not converted. They are not counted as verified, pending or failed above. Each has its reason.</p>
       <table>
         <thead><tr><th>Object</th><th>Database</th><th>Type</th><th>Tier</th><th>Why not converted</th></tr></thead>
         <tbody>${excluded.map(x => `<tr>
           <td>${esc(x.schemaName)}.${esc(x.objectName)}</td>
           <td>${esc(x.database)}</td>
           <td><span class="chip">${esc(x.objectClass)}</span></td>
           <td><span class="chip">${esc(x.tier)}</span></td>
           <td style="font-size:0.85rem">${esc(x.reason)}</td>
         </tr>`).join('')}</tbody>
       </table>`
    : '';

  const notAttempted = index.notAttempted || [];
  const notAttemptedHtml = notAttempted.length
    ? `<h2 style="margin-top:2rem">Not converted: not attempted (${notAttempted.length})</h2>
       <p style="color:var(--c-muted);font-size:0.875rem">These objects are in scope and in the inventory, but no conversion was attempted. They are not counted as verified, pending or failed above. Each says what it would need.</p>
       <table>
         <thead><tr><th>Object</th><th>Database</th><th>Type</th><th>Tier</th><th>What it needs</th></tr></thead>
         <tbody>${notAttempted.map(x => `<tr>
           <td>${esc(x.schemaName)}.${esc(x.objectName)}</td>
           <td>${esc(x.database)}</td>
           <td><span class="chip">${esc(x.objectClass)}</span></td>
           <td><span class="chip">${esc(x.tier)}</span></td>
           <td style="font-size:0.85rem">${esc(x.reason)}</td>
         </tr>`).join('')}</tbody>
       </table>`
    : '';

  root.innerHTML = `
    ${statsHtml}
    ${tierNotesHtml}
    <table>
      <thead><tr><th>Object</th><th>Database</th><th>Type</th><th>Tier</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${excludedHtml}
    ${notAttemptedHtml}
    <p style="color:var(--c-muted);font-size:0.8rem;margin-top:1rem">Built ${new Date(index.builtAt).toLocaleString()}</p>`;
}

// ─── Receipt page (receipt.html) ─────────────────────────────────────────────

async function initReceipt() {
  const root = document.getElementById('receipt');
  if (!root) return;

  const params = new URLSearchParams(location.search);
  const db  = params.get('db');
  const obj = params.get('obj');   // "Schema.ObjectName"

  if (!db || !obj) {
    root.innerHTML = `<div class="empty"><h2>Missing parameters</h2><p>Expected ?db=&amp;obj=</p></div>`;
    return;
  }

  let receipt;
  try {
    const res = await fetch(`/receipts/${encodeURIComponent(db)}/${encodeURIComponent(obj)}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    receipt = await res.json();
  } catch (e) {
    root.innerHTML = `<div class="empty"><h2>Receipt not found</h2><p>${esc(e.message)}</p></div>`;
    return;
  }

  document.title = `${obj} — ParityProven`;

  const notConverted = receipt.code.engine === 'not converted';
  const failureNote = receipt.evidence.failureDetail
    ? `<br><strong>Why it failed:</strong> ${esc(receipt.evidence.failureDetail)}` : '';
  const notVerifiedBanner = receipt.status !== 'verified'
    ? `<div class="banner-warning">⚠️ This object has not passed all 6 verification steps. Status: <strong>${receipt.status}</strong>.${failureNote}</div>`
    : '';

  const stepDetail = (n) => {
    const e = receipt.evidence;
    if (n === 2 && e.testsRun?.length) return `<span style="color:var(--c-muted);font-size:0.85rem">${e.testsRun.length} agreed test(s) on each engine</span>`;
    if (n === 5 && e.reviewer) return `<span style="color:var(--c-muted);font-size:0.85rem">by ${esc(e.reviewer)} on ${esc(e.reviewDate ?? '')}</span>`;
    return '';
  };
  const stepsHtml = receipt.verificationSteps.map(s => `
    <li>
      <span class="step-num">${s.step}</span>
      ${statusBadge(s.status)}
      <span>${esc(s.label)}</span>
      ${stepDetail(s.step)}
    </li>`).join('');

  const ev = receipt.evidence;
  const draft = ev.engineOutputCheck
    ? `<li><strong>Engine first draft:</strong> ${statusBadge(ev.engineOutputCheck.step3)} ${ev.engineOutputCheck.step3 === 'fail'
        ? `<span style="color:var(--c-muted);font-size:0.85rem">${esc(ev.engineOutputCheck.detail ?? '')}</span>`
        : '<span style="color:var(--c-muted);font-size:0.85rem">accepted unchanged</span>'}</li>`
    : '';
  const coverage = ev.samples
    ? `<li><strong>Coverage:</strong> ${ev.samplesWithRows} of ${ev.samples} generated samples returned rows (${ev.rowsCompared} rows compared)</li>`
    : `<li><strong>Rows compared:</strong> ${ev.rowsCompared ?? '—'}</li>`;
  const mutants = ev.mutantsDetected?.length
    ? `<li><strong>Planted defects caught:</strong> ${ev.mutantsDetected.map(m => esc(m)).join('; ')}</li>` : '';
  const traps = ev.trapsCovered?.length
    ? `<li><strong>Traps generated:</strong> ${ev.trapsCovered.map(t => esc(t)).join('; ')}</li>` : '';
  const runtime = ev.runtime
    ? `<li><strong>Runtime (step 4):</strong> PostgreSQL ${ev.runtime.postgresMs} ms vs SQL Server ${ev.runtime.sqlServerMs} ms server-side execution
         = <strong>${ev.runtime.ratio}×</strong> (limit ${ev.runtime.threshold}×), median of ${ev.runtime.timedRuns} runs on ${ev.runtime.volume} rows per table.
         <span style="color:var(--c-muted);font-size:0.85rem">${ev.runtime.belowResolution ? 'Both finished in under 5 ms, so this ratio is below measurement resolution and shows no speed difference. ' : ''}Both engines run in Docker on one machine; SQL Server reports whole milliseconds; indicative, not a benchmark.</span></li>
       <li><strong>Result at volume:</strong> ${ev.runtime.volumeMismatch ? 'MISMATCH — ' + esc(ev.runtime.volumeMismatch) : `${ev.runtime.resultRows} rows returned, identical on both engines`}</li>`
    : '';
  const precision = ev.subMicrosecondNormalised
    ? `<li><strong>Load-time finding:</strong> ${ev.subMicrosecondNormalised} generated datetime2(7) values had sub-microsecond ticks that PostgreSQL <code>timestamp</code> cannot hold; they were normalised to microseconds on both engines before comparing.</li>` : '';

  const testsHtml = ev.testsRun?.length
    ? `<h3>Agreed tests (step 2)</h3><ul>${ev.testsRun.map(t => `<li style="font-size:0.85rem">${esc(t)}</li>`).join('')}</ul>` : '';

  const pbtHtml = ev.pbtSeeds?.length
    ? `<ul style="padding-left:1.2rem">
         <li><strong>Seed:</strong> ${ev.pbtSeeds.join(', ')}</li>
         ${draft}${coverage}${traps}${mutants}${runtime}${precision}
         <li><strong>Harness:</strong> ${esc(ev.harnessVersion)}</li>
       </ul>
       <p style="color:var(--c-muted);font-size:0.85rem;margin-bottom:0.25rem">Re-run from the repo:</p>
       <div class="cmd">npm run convert -- --object ${esc(receipt.schemaName)}.${esc(receipt.objectName)} --seed ${ev.pbtSeeds[0]}</div>`
    : `<p style="color:var(--c-muted)">${notConverted ? 'Not converted, so there is no harness run for this object.' : 'No PBT run recorded yet.'}</p>`;

  const loadFindings = receipt.evidence.loadTimeFindings?.length
    ? `<h3>Load-time findings</h3>
       <ul>${receipt.evidence.loadTimeFindings.map(f => `<li style="font-size:0.85rem;color:var(--c-muted)">${esc(f)}</li>`).join('')}</ul>`
    : '';

  const predTierNote = receipt.predictionTier && receipt.predictionTier !== receipt.tier
    ? ` <span style="color:var(--c-muted);font-size:0.85rem">(predicted as ${esc(receipt.predictionTier)}, before the tier rules changed)</span>` : '';
  const predHtml = receipt.predictionCell
    ? `<span>P50: <strong>${receipt.predictionCell.p50Hours}h</strong> &nbsp; P90: <strong>${receipt.predictionCell.p90Hours}h</strong>${predTierNote}</span>`
    : `<span style="color:var(--c-muted)">no prediction for this type and tier</span>`;

  const notesHtml = receipt.code.notes?.length
    ? `<h3>Conversion notes</h3><ul>${receipt.code.notes.map(n => `<li style="font-size:0.85rem">${esc(n)}</li>`).join('')}</ul>`
    : '';

  const diffLines = receipt.code.diff.split('\n').map(line => {
    if (line.startsWith('+') && !line.startsWith('+++')) return `<span class="diff-add">${esc(line)}</span>`;
    if (line.startsWith('-') && !line.startsWith('---')) return `<span class="diff-del">${esc(line)}</span>`;
    if (line.startsWith('@@')) return `<span class="diff-hunk">${esc(line)}</span>`;
    return esc(line);
  }).join('\n');

  const colMappings = receipt.columnMappings?.length
    ? `<h3>Column type mappings</h3>
       <table><thead><tr><th>SQL Server</th><th>PostgreSQL</th><th>Notes</th></tr></thead>
       <tbody>${receipt.columnMappings.map(m =>
         `<tr><td>${esc(m.sqlServerType)}</td><td>${esc(m.postgresType)}</td><td style="color:var(--c-muted)">${esc(m.notes ?? '')}</td></tr>`
       ).join('')}</tbody></table>`
    : '';

  root.innerHTML = `
    ${notVerifiedBanner}

    <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:1rem">
      <h1 style="margin:0">${esc(receipt.schemaName)}.${esc(receipt.objectName)}</h1>
      ${statusBadge(receipt.status)}
      <span class="chip">${esc(receipt.objectClass)}</span>
      <span class="chip">${esc(receipt.tier)}</span>
      <span style="color:var(--c-muted);font-size:0.85rem">${esc(receipt.database)}</span>
    </div>

    <div class="card">
      <div style="display:flex;gap:2rem;flex-wrap:wrap;font-size:0.875rem">
        <div><span style="color:var(--c-muted)">Engine:</span> ${esc(receipt.code.engine)}</div>
        <div><span style="color:var(--c-muted)">Human effort:</span> ${receipt.effort.humanMinutes > 0 ? `${receipt.effort.humanMinutes} min` : '<span style="color:var(--c-muted)">not logged</span>'}</div>
        <div><span style="color:var(--c-muted)">Prediction:</span> ${predHtml}</div>
      </div>
    </div>

    <div class="tabs" id="code-tabs">
      <button class="tab-btn active" data-tab="source">Source T-SQL</button>
      <button class="tab-btn" data-tab="final">Final PL/pgSQL</button>
      <button class="tab-btn" data-tab="diff">Diff</button>
    </div>
    <div id="tab-source" class="tab-panel active"><pre><code class="language-sql">${esc(receipt.code.source)}</code></pre></div>
    <div id="tab-final"  class="tab-panel"><pre><code class="language-sql">${esc(receipt.code.final)}</code></pre></div>
    <div id="tab-diff"   class="tab-panel"><pre>${diffLines}</pre></div>

    ${notesHtml}
    ${colMappings}

    <h2>Verification steps</h2>
    <ul class="steps">${stepsHtml}</ul>

    <h2>Evidence</h2>
    ${pbtHtml}
    ${testsHtml}
    ${loadFindings}

    <p style="color:var(--c-muted);font-size:0.78rem;margin-top:2rem">Receipt built ${new Date(receipt.builtAt).toLocaleString()}</p>`;

  // Tab switching
  document.getElementById('code-tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
  });

  // Syntax highlight if hljs is loaded
  if (typeof hljs !== 'undefined') hljs.highlightAll();
}

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { initScorecard(); initReceipt(); });
} else {
  initScorecard();
  initReceipt();
}
