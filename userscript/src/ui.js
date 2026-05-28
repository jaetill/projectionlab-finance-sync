// Floating status panel — vanilla DOM. Renders into document.body and exposes
// a small API for setting state. Pure UI; talks to nobody.

const PANEL_ID = 'pl-sync-status-panel';

const STYLE = `
#${PANEL_ID} {
  position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;
  font: 12px/1.4 -apple-system, BlinkMacSystemFont, sans-serif;
  background: rgba(20, 22, 28, 0.92); color: #e8e8ec;
  border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
  padding: 10px 12px; min-width: 240px; max-width: 360px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.35);
}
#${PANEL_ID} header { font-weight: 600; margin-bottom: 6px; }
#${PANEL_ID} .row { display: flex; justify-content: space-between; gap: 12px; }
#${PANEL_ID} .ok { color: #5fdb6c; }
#${PANEL_ID} .warn { color: #ffb84d; }
#${PANEL_ID} .err { color: #ff6c6c; }
#${PANEL_ID} ul { margin: 6px 0 0; padding-left: 18px; }
#${PANEL_ID} li { margin: 2px 0; }
#${PANEL_ID} .step { font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
`;

function injectStyle(doc) {
  if (doc.getElementById(`${PANEL_ID}-style`)) return;
  const style = doc.createElement('style');
  style.id = `${PANEL_ID}-style`;
  style.textContent = STYLE;
  doc.head.appendChild(style);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(label, value, cls = '') {
  return `<div class="row"><span>${escapeHtml(label)}</span><span class="${cls}">${escapeHtml(value)}</span></div>`;
}

export function formatResult(result) {
  if (!result) return '<div>No sync yet.</div>';
  const cls = result.ok ? 'ok' : 'err';
  const lines = [row('Sync result', result.ok ? 'OK' : 'Errors', cls)];

  if (Array.isArray(result.steps) && result.steps.length) {
    const stepLines = result.steps
      .map((s) => {
        const mark = s.ok ? '✅' : '❌';
        const dur = typeof s.durationMs === 'number' ? ` (${s.durationMs}ms)` : '';
        return `<li class="step">${mark} ${escapeHtml(s.name)}${escapeHtml(dur)}</li>`;
      })
      .join('');
    lines.push(`<ul>${stepLines}</ul>`);
  }

  if (Array.isArray(result.warnings) && result.warnings.length) {
    const w = result.warnings
      .slice(0, 3)
      .map((m) => `<li>${escapeHtml(m)}</li>`)
      .join('');
    lines.push(`<div class="warn">Warnings:</div><ul class="warn">${w}</ul>`);
  }

  if (Array.isArray(result.errors) && result.errors.length) {
    const items = result.errors
      .slice(0, 3)
      .map((e) => `<li>${escapeHtml(e.scope)}: ${escapeHtml(e.message)}</li>`)
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
    row('Rollback ready', state.hasRollback ? 'yes' : 'no', state.hasRollback ? 'ok' : 'warn'),
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
