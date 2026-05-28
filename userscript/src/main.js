// Bootstrap — wires storage helpers, sync, and UI into Tampermonkey menu commands.
// Stays small on purpose; everything testable lives in the sibling modules.

import {
  clearApiKey,
  clearRollbackSnapshot,
  getApiKey,
  getLastSyncAt,
  getPlan,
  getRollbackSnapshot,
  hasApiKey,
  recordSync,
  setApiKey,
  setPlanRaw,
  setRollbackSnapshot,
} from './auth.js';
import { validatePlan } from './plan-validator.js';
import { rollbackTo, syncPlan } from './sync.js';
import { renderStatusPanel } from './ui.js';

const LOG_PREFIX = '[pl-sync]';

export function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

export async function waitForPluginAPI(timeoutMs = 30000, pollMs = 200) {
  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : globalThis.window;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const api = win?.projectionlabPluginAPI;
    if (api) return api;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error('projectionlabPluginAPI did not load within timeout');
}

function readState(lastResult = null) {
  return {
    hasApiKey: hasApiKey(),
    hasPlan: !!getPlan(),
    hasRollback: !!getRollbackSnapshot(),
    lastSyncAt: getLastSyncAt(),
    lastResult,
  };
}

export function rerender(lastResult = null) {
  renderStatusPanel(readState(lastResult));
}

export async function handleSyncCommand() {
  const plan = getPlan();
  if (!plan) {
    alert('No plan.json set. Use "Set plan.json" first.');
    return;
  }
  const apiKey = getApiKey();
  if (!apiKey) {
    alert('No PL API key set. Use "Set PL API Key" first.');
    return;
  }
  let pl;
  try {
    pl = await waitForPluginAPI();
  } catch (err) {
    log('Plugin API timeout', err);
    rerender({
      ok: false,
      steps: [],
      errors: [{ scope: 'wait-for-plugin-api', message: err.message }],
    });
    return;
  }
  log('Starting sync');
  const result = await syncPlan(plan, pl, apiKey);
  if (result.rollbackSnapshot) {
    try {
      setRollbackSnapshot(result.rollbackSnapshot);
    } catch (err) {
      log('Failed to save rollback snapshot', err);
    }
  }
  if (result.ok) recordSync(new Date(result.finishedAt ?? Date.now()).toISOString());
  log('Sync done', result);
  rerender(result);
}

export async function handleRollbackCommand() {
  const snapshot = getRollbackSnapshot();
  if (!snapshot) {
    alert('No rollback snapshot stored. Run a sync first to capture one.');
    return;
  }
  const apiKey = getApiKey();
  if (!apiKey) {
    alert('No PL API key set.');
    return;
  }
  if (!confirm('Restore ProjectionLab to the snapshot captured before the last sync?')) return;
  let pl;
  try {
    pl = await waitForPluginAPI();
  } catch (err) {
    alert(`Plugin API not ready: ${err.message}`);
    return;
  }
  log('Starting rollback');
  const result = await rollbackTo(snapshot, pl, apiKey);
  log('Rollback done', result);
  rerender(result);
}

export function handleSetApiKeyCommand() {
  const key = prompt('Paste your ProjectionLab Plugin API Key:');
  if (!key) return;
  try {
    setApiKey(key);
    log('API key set');
    rerender();
  } catch (err) {
    alert(`Failed to set API key: ${err.message}`);
  }
}

export function handleClearApiKeyCommand() {
  if (!confirm('Clear the stored PL API key?')) return;
  clearApiKey();
  log('API key cleared');
  rerender();
}

export function handleSetPlanCommand() {
  const raw = prompt('Paste plan.json contents:');
  if (!raw) return;
  let parsed;
  try {
    parsed = setPlanRaw(raw);
  } catch (err) {
    alert(`Could not parse JSON: ${err.message}`);
    return;
  }
  const validation = validatePlan(parsed);
  if (!validation.valid) {
    alert(`plan.json is invalid:\n\n${validation.errors.join('\n')}`);
    return;
  }
  if (validation.warnings?.length) {
    log('plan.json warnings', validation.warnings);
  }
  log('plan.json set');
  rerender();
}

export function handleClearRollbackCommand() {
  if (!confirm('Discard the stored rollback snapshot?')) return;
  clearRollbackSnapshot();
  log('Rollback snapshot cleared');
  rerender();
}

export function registerMenuCommands() {
  if (typeof GM_registerMenuCommand === 'undefined') return;
  GM_registerMenuCommand('Set PL API Key', handleSetApiKeyCommand);
  GM_registerMenuCommand('Clear PL API Key', handleClearApiKeyCommand);
  GM_registerMenuCommand('Set plan.json', handleSetPlanCommand);
  GM_registerMenuCommand('Sync now', () => {
    handleSyncCommand().catch((err) => log('Sync threw', err));
  });
  GM_registerMenuCommand('Rollback to last snapshot', () => {
    handleRollbackCommand().catch((err) => log('Rollback threw', err));
  });
  GM_registerMenuCommand('Clear rollback snapshot', handleClearRollbackCommand);
}

export function bootstrap() {
  registerMenuCommands();
  rerender();
  log('Loaded; waiting for user to trigger Sync now');
  // No auto-sync on page load — financial mutations require explicit user action.
  void getApiKey; // keep getApiKey reachable through this module for tests
}
