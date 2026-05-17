// Configuration helpers — read/write secrets and runtime state in Tampermonkey storage.
// All values live in GM_* storage; nothing here ever touches the network or the page DOM.

const KEYS = Object.freeze({
  apiKey: 'apiKey',
  plan: 'plan',
  accountMap: 'accountMap',
  lastSyncAt: 'lastSyncAt',
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
  if (!value) {
    throw new Error('API key cannot be empty');
  }
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

export function getAccountMap() {
  const raw = GM_getValue(KEYS.accountMap, null);
  if (!raw || typeof raw !== 'object') return {};
  return raw;
}

export function setAccountMap(map) {
  if (!map || typeof map !== 'object') {
    throw new Error('accountMap must be an object');
  }
  GM_setValue(KEYS.accountMap, map);
}

export function getLastSyncAt() {
  return GM_getValue(KEYS.lastSyncAt, null);
}

export function recordSync(timestamp = new Date().toISOString()) {
  GM_setValue(KEYS.lastSyncAt, timestamp);
  return timestamp;
}

export const STORAGE_KEYS = KEYS;
