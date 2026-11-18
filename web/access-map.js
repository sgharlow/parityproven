/* ParityProven — Agent Access Map page: renders /web/data/agent-access-map.json (the same file the MCP server reads). */

function escMap(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function initAccessMap() {
  const root = document.getElementById('access-map');
  if (!root) return;
  let map;
  try {
    const res = await fetch('/web/data/agent-access-map.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    map = await res.json();
  } catch (e) {
    root.innerHTML = `<div class="empty"><h2>Could not load the access map</h2><p>${escMap(e.message)}</p></div>`;
    return;
  }

  const exposed = map.exposed || [];
  const notExposed = map.notExposed || [];
  const list = (xs) => `<ul>${xs.map((x) => `<li>${escMap(x)}</li>`).join('')}</ul>`;

  const entityRows = exposed.map((e) => `<tr>
      <td><strong>${escMap(e.entity)}</strong>${list(e.actions)}</td>
      <td><code>${escMap(e.view)}</code><br><span style="color:var(--c-muted);font-size:0.85rem">tool <code>${escMap(e.tool)}</code>; ${e.columns.length} columns; at most ${e.maxRows} rows per call${e.filters.length ? `; filter: ${e.filters.map((f) => `<code>${escMap(f.name)}</code>`).join(', ')}` : ''}</span></td>
      <td><span class="chip">${escMap(e.risk.sensitivity)}</span><br><span style="font-size:0.85rem">write risk: ${escMap(e.risk.writeRisk)}</span><br><span style="color:var(--c-muted);font-size:0.85rem">${escMap(e.risk.rationale)}</span></td>
    </tr>`).join('');

  const notRows = notExposed.map((x) => `<tr><td>${escMap(x.entity)}</td><td><span class="chip">${escMap(x.risk)}</span></td><td style="font-size:0.85rem">${escMap(x.reason)}</td></tr>`).join('');

  const c = map.controls || {};
  const u = map.firstUseCase || {};
  root.innerHTML = `
    <div class="banner-warning">${escMap(map.status)}</div>
    <p><strong>System:</strong> ${escMap(map.system)} — ${escMap(map.sourceDatabase)}</p>

    <h2>1–2. Entities an agent needs, and the read-only views that expose them (${exposed.length})</h2>
    <table>
      <thead><tr><th>Entity and actions</th><th>Exposed through</th><th>4. Risk (judgment)</th></tr></thead>
      <tbody>${entityRows}</tbody>
    </table>

    <h2>Not exposed (${notExposed.length})</h2>
    <table>
      <thead><tr><th>Entity</th><th>Risk (judgment)</th><th>Why not</th></tr></thead>
      <tbody>${notRows}</tbody>
    </table>

    <h2>3. Authentication, row-level limits and audit</h2>
    <ul>
      <li><strong>Authentication:</strong> ${escMap(c.authentication)}</li>
      <li><strong>Read-only:</strong> ${escMap(c.readOnlyBy)}</li>
      <li><strong>Row limits:</strong> ${escMap(c.rowLimits)}${(c.rowLevelRoles || []).length ? ` Territory role: ${c.rowLevelRoles.map((r) => `<code>${escMap(r)}</code>`).join(', ')}.` : ''}</li>
      <li><strong>Audit:</strong> ${escMap(c.audit)}</li>
    </ul>

    <h2>5. First recommended use case</h2>
    <div class="card">
      <p><strong>${escMap(u.title)}</strong></p>
      <p>${escMap(u.description)}</p>
      <p>Effort: P50 <strong>${escMap(u.effortHours?.p50)} h</strong>, P90 <strong>${escMap(u.effortHours?.p90)} h</strong>. <span style="color:var(--c-muted)">${escMap(u.effortBasis)}</span></p>
    </div>

    <p style="color:var(--c-muted);font-size:0.85rem">${escMap(map.judgmentNote)} The server, its negative test and its audit log are in the
      <a href="https://github.com/sgharlow/parityproven" target="_blank" rel="noopener">repository</a> (src/mcp, npm run mcp:check, evidence/mcp).</p>`;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAccessMap);
else initAccessMap();
