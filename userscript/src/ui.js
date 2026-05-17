// Floating status panel — vanilla DOM. Renders into document.body and exposes a
// small API for setting state. Pure UI; talks to nobody.

const PANEL_ID = 'pl-sync-status-panel';

const STYLE = `
#${PANEL_ID} {
  position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;
  font: 12px/1.4 -apple-system, BlinkMacSystemFont, sans-serif;
  background: rgba(20, 22, 28, 0.92); color: #e8e8ec;
  border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
  padding: 10px 12px; min-width: 220px; max-width: 320px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.35);
}
#${PANEL_ID} header { font-weight: 600; margin-bottom: 6px; }
#${PANEL_ID} .row { display: flex; justify-content: space-between; gap: 12px; }
#${PANEL_ID} .ok { color: #5fdb6c; }
#${PANEL_ID} .warn { color: #ffb84d; }
#${PANEL_ID} .err { color: #ff6c6c; }
#${PANEL_ID} ul { margin: 6px 0 0; padding-left: 18px; }
#${PANEL_ID} li { margin: 2px 0; }
`;

function injectStyle(doc) {
  if (doc.getElementById(`${PANEL_ID}-style`)) return;
  const style = doc.createElement('style');
  style.id = `${PANEL_ID}-style`;
  style.textContent = STYLE;
  doc.head.appendChild(style);
}

function row(label, value, cls = '') {
  return `<div class="row"><span>${label}</span><span class="${cls}">${value}</span></div>`;
}

function pluralize(n, label) {
  return `${n} ${label}${n === 1 ? '' : 's'}`;
}

export function formatResult(result) {
  if (!result) return '<div>No sync yet.</div>';
  const cls = result.ok ? 'ok' : 'err';
  const counts = result.counts ?? {};
  const lines = [
    row('Status', result.ok ? 'OK' : 'Errors', cls),
    row('Updated', pluralize(counts.accounts ?? 0, 'account')),
    row('Income', pluralize(counts.income ?? 0, 'stream')),
    row('Expenses', pluralize(counts.expenses ?? 0, 'stream')),
    row('Milestones', pluralize(counts.milestones ?? 0, 'item')),
  ];
  if (result.unresolved?.length) {
    lines.push(`<div class="warn">Unresolved: ${result.unresolved.length}</div>`);
  }
  if (result.errors?.length) {
    const items = result.errors
      .slice(0, 3)
      .map((e) => `<li>${e.scope}: ${e.message}</li>`)
      .join('');
    lines.push(`<ul class="err">${items}</ul>`);
  }
  return lines.join('');
}

function statusRows(state) {
  return [
    row('API key', state.hasApiKey ? 'set ✅' : 'missing ❌', state.hasApiKey ? 'ok' : 'err'),
    row('plan.json', state.hasPlan ? 'set ✅' : 'missing ❌', state.hasPlan ? 'ok' : 'err'),
    row('Last sync', state.lastSyncAt ?? 'never'),
  ].join('');
}

export function renderStatusPanel(state, doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return null;
  injectStyle(doc);
  let panel = doc.getElementById(PANEL_ID);
  if (!panel) {
    panel = doc.createElement('div');
    panel.id = PANEL_ID;
    doc.body.appendChild(panel);
  }
  panel.innerHTML = `
    <header>ProjectionLab Finance Sync</header>
    ${statusRows(state)}
    <div style="margin-top:6px;">${formatResult(state.lastResult)}</div>
  `;
  return panel;
}
