// Storage helpers — read/write secrets and runtime state in Tampermonkey storage.
// Nothing here touches the network or the page DOM. All values live in GM_*.

const KEYS = Object.freeze({
  apiKey: 'apiKey',
  plan: 'plan',
  lastSyncAt: 'lastSyncAt',
  rollbackSnapshot: 'rollbackSnapshot',
});

function trim(value) {
  return typeof value === 'string' ? value.trim() : value;
}

export function getApiKey() {
  const raw = GM_getValue(KEYS.apiKey, null);
  const value = trim(raw);
  return value ? value : null;
}

export function setApiKey(key) {
  const value = trim(key);
  if (!value) throw new Error('API key cannot be empty');
  GM_setValue(KEYS.apiKey, value);
}

export function clearApiKey() {
  GM_setValue(KEYS.apiKey, '');
}

export function hasApiKey() {
  return getApiKey() !== null;
}

export function getPlan() {
  const raw = GM_getValue(KEYS.plan, null);
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setPlanRaw(jsonString) {
  const parsed = JSON.parse(jsonString);
  GM_setValue(KEYS.plan, parsed);
  return parsed;
}

export function clearPlan() {
  GM_setValue(KEYS.plan, null);
}

export function getLastSyncAt() {
  return GM_getValue(KEYS.lastSyncAt, null);
}

export function recordSync(timestamp = new Date().toISOString()) {
  GM_setValue(KEYS.lastSyncAt, timestamp);
  return timestamp;
}

// Rollback baseline: full pl.exportData() output captured immediately before
// every sync. Lets the user revert via "Rollback to last snapshot" if they
// don't like the sync's effect on PL.
export function getRollbackSnapshot() {
  return GM_getValue(KEYS.rollbackSnapshot, null);
}

export function setRollbackSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('rollback snapshot must be an object');
  }
  GM_setValue(KEYS.rollbackSnapshot, snapshot);
}

export function clearRollbackSnapshot() {
  GM_setValue(KEYS.rollbackSnapshot, null);
}

export const STORAGE_KEYS = KEYS;
