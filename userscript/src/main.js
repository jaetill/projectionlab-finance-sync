// Bootstrap — wires storage helpers, sync, and UI into Tampermonkey menu commands.
// Stays small on purpose; everything testable lives in the sibling modules.

import {
  getAccountMap,
  getApiKey,
  getLastSyncAt,
  getPlan,
  hasApiKey,
  recordSync,
  setApiKey,
  setPlanRaw,
} from './auth.js';
import { validatePlan } from './plan-validator.js';
import { syncPlan } from './sync.js';
import { renderStatusPanel } from './ui.js';

const LOG_PREFIX = '[pl-sync]';

export function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

export async function waitForPluginAPI(timeoutMs = 30000, pollMs = 200) {
  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const api = win.projectionlabPluginAPI;
    if (api) return api;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error('projectionlabPluginAPI did not load within timeout');
}

function readState(lastResult = null) {
  return {
    hasApiKey: hasApiKey(),
    hasPlan: !!getPlan(),
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
  if (!hasApiKey()) {
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
      counts: {},
      errors: [{ scope: 'waitForPluginAPI', message: err.message }],
    });
    return;
  }
  log('Starting sync');
  const result = await syncPlan(plan, pl, getAccountMap());
  if (result.ok) recordSync(result.finishedAt ?? new Date().toISOString());
  log('Sync done', result);
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
  log('plan.json set');
  rerender();
}

export function registerMenuCommands() {
  if (typeof GM_registerMenuCommand === 'undefined') return;
  GM_registerMenuCommand('Set PL API Key', handleSetApiKeyCommand);
  GM_registerMenuCommand('Set plan.json', handleSetPlanCommand);
  GM_registerMenuCommand('Sync now', () => {
    handleSyncCommand().catch((err) => log('Sync threw', err));
  });
}

export function bootstrap() {
  registerMenuCommands();
  rerender();
  log('Loaded; waiting for user to trigger Sync now');
  // No auto-sync on page load — financial mutations require explicit user action.
  // unused import shim so getApiKey is reachable from tests via this module
  void getApiKey;
}
