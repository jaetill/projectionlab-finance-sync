import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEYS,
  clearApiKey,
  clearPlan,
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
} from '../../userscript/src/auth.js';

describe('auth: API key', () => {
  it('returns null when nothing is stored', () => {
    expect(getApiKey()).toBeNull();
    expect(hasApiKey()).toBe(false);
  });

  it('round-trips a key (trimming whitespace)', () => {
    setApiKey('  pl_secret_abc123  ');
    expect(getApiKey()).toBe('pl_secret_abc123');
    expect(hasApiKey()).toBe(true);
  });

  it('rejects empty/whitespace keys', () => {
    expect(() => setApiKey('   ')).toThrow();
    expect(() => setApiKey('')).toThrow();
    expect(() => setApiKey(null)).toThrow();
  });

  it('clearApiKey empties the slot', () => {
    setApiKey('pl_secret');
    clearApiKey();
    expect(getApiKey()).toBeNull();
    expect(hasApiKey()).toBe(false);
  });
});

describe('auth: plan', () => {
  it('returns null when no plan is stored', () => {
    expect(getPlan()).toBeNull();
  });

  it('parses and stores a JSON string', () => {
    const parsed = setPlanRaw('{"today":{"savingsAccounts":[]},"plans":[{"id":"p","name":"P"}]}');
    expect(parsed.today).toBeDefined();
    expect(getPlan()).toEqual(parsed);
  });

  it('throws on invalid JSON', () => {
    expect(() => setPlanRaw('{not json')).toThrow();
  });

  it('clearPlan wipes it', () => {
    setPlanRaw('{"today":{},"plans":[]}');
    clearPlan();
    expect(getPlan()).toBeNull();
  });
});

describe('auth: lastSyncAt', () => {
  it('returns null when nothing recorded', () => {
    expect(getLastSyncAt()).toBeNull();
  });

  it('records and reads back the timestamp', () => {
    const t = recordSync('2026-05-18T10:00:00Z');
    expect(t).toBe('2026-05-18T10:00:00Z');
    expect(getLastSyncAt()).toBe('2026-05-18T10:00:00Z');
  });

  it('defaults to "now" if no timestamp is passed', () => {
    const t = recordSync();
    expect(typeof t).toBe('string');
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(getLastSyncAt()).toBe(t);
  });
});

describe('auth: rollback snapshot', () => {
  it('starts empty', () => {
    expect(getRollbackSnapshot()).toBeNull();
  });

  it('round-trips a snapshot object', () => {
    const snap = { today: { savingsAccounts: [] }, plans: [{ id: 'p', name: 'P' }] };
    setRollbackSnapshot(snap);
    expect(getRollbackSnapshot()).toEqual(snap);
  });

  it('rejects non-object snapshots', () => {
    expect(() => setRollbackSnapshot(null)).toThrow();
    expect(() => setRollbackSnapshot('foo')).toThrow();
  });

  it('clearRollbackSnapshot wipes it', () => {
    setRollbackSnapshot({ today: {} });
    clearRollbackSnapshot();
    expect(getRollbackSnapshot()).toBeNull();
  });
});

describe('auth: STORAGE_KEYS', () => {
  it('exposes stable key names', () => {
    expect(STORAGE_KEYS.apiKey).toBe('apiKey');
    expect(STORAGE_KEYS.plan).toBe('plan');
    expect(STORAGE_KEYS.lastSyncAt).toBe('lastSyncAt');
    expect(STORAGE_KEYS.rollbackSnapshot).toBe('rollbackSnapshot');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(STORAGE_KEYS)).toBe(true);
  });
});
