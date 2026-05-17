import { describe, expect, it } from 'vitest';
import {
  clearApiKey,
  getAccountMap,
  getApiKey,
  getLastSyncAt,
  getPlan,
  hasApiKey,
  recordSync,
  setAccountMap,
  setApiKey,
  setPlanRaw,
} from '../../userscript/src/auth.js';

describe('auth / storage helpers', () => {
  it('returns null when no API key is set', () => {
    expect(getApiKey()).toBeNull();
    expect(hasApiKey()).toBe(false);
  });

  it('stores and trims the API key', () => {
    setApiKey('   abc123   ');
    expect(getApiKey()).toBe('abc123');
    expect(hasApiKey()).toBe(true);
  });

  it('rejects empty API keys', () => {
    expect(() => setApiKey('')).toThrow(/cannot be empty/);
    expect(() => setApiKey('   ')).toThrow(/cannot be empty/);
  });

  it('clears the API key', () => {
    setApiKey('to-be-cleared');
    clearApiKey();
    expect(getApiKey()).toBeNull();
  });

  it('parses a plan JSON string on set and round-trips it', () => {
    const plan = setPlanRaw('{"schemaVersion":1,"asOfDate":"2026-01-01","accounts":[]}');
    expect(plan.schemaVersion).toBe(1);
    expect(getPlan()).toEqual(plan);
  });

  it('returns null for a missing plan', () => {
    expect(getPlan()).toBeNull();
  });

  it('returns an empty object when no accountMap is set', () => {
    expect(getAccountMap()).toEqual({});
  });

  it('stores and reads back the account map', () => {
    setAccountMap({ 'Acme Brokerage': 'acc_1' });
    expect(getAccountMap()).toEqual({ 'Acme Brokerage': 'acc_1' });
  });

  it('rejects non-object accountMaps', () => {
    expect(() => setAccountMap(null)).toThrow();
    expect(() => setAccountMap('not an object')).toThrow();
  });

  it('records a sync timestamp', () => {
    const ts = recordSync('2026-05-11T12:00:00.000Z');
    expect(ts).toBe('2026-05-11T12:00:00.000Z');
    expect(getLastSyncAt()).toBe('2026-05-11T12:00:00.000Z');
  });
});
