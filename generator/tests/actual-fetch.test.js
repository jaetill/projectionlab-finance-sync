import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  readConfig,
  normalizeAccount,
  rollupCategorySpend,
  computeSanityChecks,
  fetchActualSnapshot,
} from '../src/sources/actual.js';

const FIXTURE_PATH = resolve(import.meta.dirname, 'fixtures/actual.sample.json');

/**
 * Materialize the fixture against a fixed `now`. Replaces date placeholders
 * with concrete ISO dates so tests don't drift with the wall clock.
 */
function materializeFixture(now) {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  const day = 24 * 60 * 60 * 1000;
  const iso = (d) => new Date(d).toISOString();
  const isoDate = (d) => iso(d).slice(0, 10);

  // Recent = 2 days ago (well within 7d staleness threshold).
  // Stale  = 20 days ago (well past it).
  const recent = iso(now.getTime() - 2 * day);
  const stale = iso(now.getTime() - 20 * day);

  // Transaction dates spread across the last ~30 days.
  const txnDates = {};
  for (let i = 1; i <= 8; i++) {
    txnDates[`__T_RECENT_${i}__`] = isoDate(now.getTime() - i * 3 * day);
  }

  const sub = (s) => {
    if (typeof s !== 'string') return s;
    if (s === '__RECENT__') return recent;
    if (s === '__STALE__') return stale;
    if (txnDates[s]) return txnDates[s];
    return s;
  };
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return sub(v);
  };

  return walk(raw);
}

/**
 * Build a fake @actual-app/api with init/shutdown spies + scripted reads.
 * Records the calls so tests can assert wiring (groupId, not cloudFileId, etc.).
 */
function makeFakeApi(fixture, overrides = {}) {
  const calls = {
    init: [],
    downloadBudget: [],
    getTransactions: [],
    getAccountBalance: [],
    shutdown: 0,
  };
  const api = {
    init: vi.fn(async (cfg) => {
      calls.init.push(cfg);
    }),
    getBudgets: vi.fn(async () => overrides.getBudgets ?? fixture.getBudgets),
    downloadBudget: vi.fn(async (syncId, opts) => {
      calls.downloadBudget.push({ syncId, opts });
    }),
    getAccounts: vi.fn(async () => fixture.getAccounts),
    // getAccountBalance is the authoritative balance source (see actual.js).
    // Default: echo the fixture account's balance so existing balance
    // assertions hold. overrides.balances[id] lets a test return a value that
    // DIFFERS from the stale getAccounts().balance field, proving precedence.
    getAccountBalance: vi.fn(async (id) => {
      calls.getAccountBalance.push(id);
      if (overrides.balances && id in overrides.balances) return overrides.balances[id];
      const acct = fixture.getAccounts.find((a) => a.id === id);
      return acct ? acct.balance : 0;
    }),
    getCategories: vi.fn(async () => fixture.getCategories),
    getCategoryGroups: vi.fn(async () => fixture.getCategoryGroups),
    getTransactions: vi.fn(async (accountId, start, end) => {
      calls.getTransactions.push({ accountId, start, end });
      return fixture.getTransactions[accountId] ?? [];
    }),
    shutdown: vi.fn(async () => {
      calls.shutdown += 1;
    }),
  };
  return { api, calls };
}

const BASE_ENV = {
  ACTUAL_PASSWORD: 'secret',
  ACTUAL_BUDGET_NAME: 'Sample Household',
};

describe('readConfig', () => {
  it('returns full config when env is complete', () => {
    expect(readConfig(BASE_ENV)).toMatchObject({
      password: 'secret',
      budgetName: 'Sample Household',
      serverUrl: 'http://localhost:5006',
    });
  });

  it('throws when ACTUAL_PASSWORD missing', () => {
    expect(() => readConfig({ ACTUAL_BUDGET_NAME: 'x' })).toThrow(/ACTUAL_PASSWORD/);
  });

  it('throws when ACTUAL_BUDGET_NAME missing', () => {
    expect(() => readConfig({ ACTUAL_PASSWORD: 'x' })).toThrow(/ACTUAL_BUDGET_NAME/);
  });

  it('honors ACTUAL_SERVER override', () => {
    expect(readConfig({ ...BASE_ENV, ACTUAL_SERVER: 'http://elsewhere:9999' }).serverUrl).toBe(
      'http://elsewhere:9999',
    );
  });

  it('honors ACTUAL_DATA_DIR override', () => {
    expect(readConfig({ ...BASE_ENV, ACTUAL_DATA_DIR: '/custom' }).dataDir).toBe('/custom');
  });
});

describe('normalizeAccount', () => {
  it('converts cents to dollars', () => {
    expect(normalizeAccount({ id: 'a', name: 'A', balance: 12345 }).balance).toBe(123.45);
  });

  it('coerces bool fields', () => {
    expect(
      normalizeAccount({ id: 'a', name: 'A', balance: 0, offbudget: 1, closed: 0 }),
    ).toMatchObject({
      offBudget: true,
      closed: false,
    });
  });

  it('handles null balance', () => {
    expect(normalizeAccount({ id: 'a', name: 'A', balance: null }).balance).toBeNull();
  });

  it('preserves identity fields', () => {
    const out = normalizeAccount({ id: 'a1', name: 'Checking', type: 'checking', balance: 100 });
    expect(out).toMatchObject({ actualId: 'a1', name: 'Checking', type: 'checking' });
  });
});

describe('rollupCategorySpend', () => {
  const catById = new Map([
    ['c-groc', { id: 'c-groc', name: 'Groceries', group_id: 'g-var', is_income: false }],
    ['c-rest', { id: 'c-rest', name: 'Restaurants', group_id: 'g-var', is_income: false }],
    ['c-sal', { id: 'c-sal', name: 'Salary', group_id: 'g-inc', is_income: true }],
  ]);
  const groupById = new Map([
    ['g-var', { id: 'g-var', name: 'Variable' }],
    ['g-inc', { id: 'g-inc', name: 'Income' }],
  ]);

  it('sums expense categories and flips sign to positive dollars', () => {
    const txns = [
      { amount: -10000, category: 'c-groc' },
      { amount: -5000, category: 'c-groc' },
    ];
    const out = rollupCategorySpend(txns, catById, groupById, 90);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'Groceries', total: 150, txnCount: 2 });
    expect(out[0].monthlyAvg).toBeCloseTo(50, 5);
  });

  it('excludes transfers (transfer_id set)', () => {
    const txns = [
      { amount: -10000, category: 'c-groc' },
      { amount: -50000, category: 'c-groc', transfer_id: 'xfer-1' },
    ];
    const [groc] = rollupCategorySpend(txns, catById, groupById, 90);
    expect(groc.total).toBe(100);
    expect(groc.txnCount).toBe(1);
  });

  it('excludes uncategorized transactions', () => {
    const txns = [
      { amount: -10000, category: 'c-groc' },
      { amount: -2000, category: null },
    ];
    expect(rollupCategorySpend(txns, catById, groupById, 90)).toHaveLength(1);
  });

  it('excludes income categories', () => {
    const txns = [
      { amount: 500000, category: 'c-sal' },
      { amount: -10000, category: 'c-groc' },
    ];
    const out = rollupCategorySpend(txns, catById, groupById, 90);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Groceries');
  });

  it('attaches groupName from groupById', () => {
    const [out] = rollupCategorySpend(
      [{ amount: -1000, category: 'c-groc' }],
      catById,
      groupById,
      90,
    );
    expect(out.groupName).toBe('Variable');
  });

  it('sorts descending by total', () => {
    const txns = [
      { amount: -5000, category: 'c-groc' },
      { amount: -20000, category: 'c-rest' },
    ];
    const out = rollupCategorySpend(txns, catById, groupById, 90);
    expect(out.map((o) => o.name)).toEqual(['Restaurants', 'Groceries']);
  });

  it('handles empty input', () => {
    expect(rollupCategorySpend([], catById, groupById, 90)).toEqual([]);
  });
});

describe('computeSanityChecks', () => {
  const now = new Date('2026-05-28T00:00:00Z');

  it('counts unmarked transfers via payee heuristic', () => {
    const out = computeSanityChecks(
      [
        { payee_name: 'Transfer to Savings', transfer_id: null, category: 'c-x' },
        { payee_name: 'Savings Account', transfer_id: 'xfer-1', category: null },
        { payee_name: 'Grocer', transfer_id: null, category: 'c-groc' },
      ],
      [],
      now,
    );
    expect(out.unmarkedTransfers).toBe(1);
  });

  it('counts uncategorized non-transfer transactions', () => {
    const out = computeSanityChecks(
      [
        { payee_name: 'X', transfer_id: null, category: null },
        { payee_name: 'Y', transfer_id: 'xfer-1', category: null },
        { payee_name: 'Z', transfer_id: null, category: 'c-x' },
      ],
      [],
      now,
    );
    expect(out.uncategorized).toBe(1);
  });

  it('does not double-count an unmarked-transfer as uncategorized', () => {
    // t7-style row: looks like a transfer AND has no category. Should hit
    // unmarkedTransfers but not uncategorized.
    const out = computeSanityChecks(
      [{ payee_name: 'Transfer to Savings', transfer_id: null, category: null }],
      [],
      now,
    );
    expect(out.unmarkedTransfers).toBe(1);
    expect(out.uncategorized).toBe(0);
  });

  it('flags accounts whose last_reconciled is > 7 days old', () => {
    const ms = 24 * 60 * 60 * 1000;
    const recent = new Date(now.getTime() - 2 * ms).toISOString();
    const stale = new Date(now.getTime() - 20 * ms).toISOString();
    const out = computeSanityChecks(
      [],
      [
        { name: 'Fresh', closed: false, last_reconciled: recent },
        { name: 'Stale', closed: false, last_reconciled: stale },
        { name: 'Closed Stale', closed: true, last_reconciled: stale },
        { name: 'Never', closed: false, last_reconciled: null },
      ],
      now,
    );
    expect(out.staleAccounts.map((a) => a.name)).toEqual(['Stale']);
  });
});

describe('fetchActualSnapshot (integration with injected api)', () => {
  const now = new Date('2026-05-28T12:00:00Z');

  it('returns the expected top-level shape', async () => {
    const fixture = materializeFixture(now);
    const { api } = makeFakeApi(fixture);
    const snap = await fetchActualSnapshot({ env: BASE_ENV, api, now });
    expect(snap).toMatchObject({
      serverUrl: 'http://localhost:5006',
      budgetName: 'Sample Household',
      windowDays: 90,
      windowEnd: '2026-05-28',
    });
    expect(snap.fetchedAt).toBe(now.toISOString());
    expect(Array.isArray(snap.accounts)).toBe(true);
    expect(Array.isArray(snap.categorySpend90d)).toBe(true);
    expect(snap.sanityChecks).toBeDefined();
  });

  it('creates the dataDir before init (no ENOENT on a fresh user temp)', async () => {
    const { mkdtemp, rm, stat } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const parentDir = await mkdtemp(join(tmpdir(), 'actual-mkdir-test-'));
    const dataDir = join(parentDir, 'nested', 'actual-cache');
    try {
      const fixture = materializeFixture(now);
      const { api } = makeFakeApi(fixture);
      await fetchActualSnapshot({
        env: { ...BASE_ENV, ACTUAL_DATA_DIR: dataDir },
        api,
        now,
      });
      const st = await stat(dataDir);
      expect(st.isDirectory()).toBe(true);
    } finally {
      await rm(parentDir, { recursive: true, force: true });
    }
  });

  it('uses groupId (not cloudFileId) for downloadBudget', async () => {
    const fixture = materializeFixture(now);
    const { api, calls } = makeFakeApi(fixture);
    await fetchActualSnapshot({ env: BASE_ENV, api, now });
    expect(calls.downloadBudget).toHaveLength(1);
    expect(calls.downloadBudget[0].syncId).toBe('GROUP-AAAA');
  });

  it('calls downloadBudget with a positional string, not an object', async () => {
    const fixture = materializeFixture(now);
    const { api } = makeFakeApi(fixture);
    await fetchActualSnapshot({ env: BASE_ENV, api, now });
    const [firstArg] = api.downloadBudget.mock.calls[0];
    expect(typeof firstArg).toBe('string');
  });

  it('skips closed accounts when pulling transactions', async () => {
    const fixture = materializeFixture(now);
    const { api, calls } = makeFakeApi(fixture);
    await fetchActualSnapshot({ env: BASE_ENV, api, now });
    const fetched = calls.getTransactions.map((c) => c.accountId);
    expect(fetched).not.toContain('acct-old-closed');
  });

  it('throws when the named budget is not found', async () => {
    const fixture = materializeFixture(now);
    const { api } = makeFakeApi(fixture, { getBudgets: [] });
    await expect(fetchActualSnapshot({ env: BASE_ENV, api, now })).rejects.toThrow(
      /Sample Household.+not found/,
    );
  });

  it('calls shutdown even when an error is thrown', async () => {
    const fixture = materializeFixture(now);
    const { api, calls } = makeFakeApi(fixture, { getBudgets: [] });
    await expect(fetchActualSnapshot({ env: BASE_ENV, api, now })).rejects.toThrow();
    expect(calls.shutdown).toBe(1);
  });

  it('produces normalized accounts with cents->dollars balances', async () => {
    const fixture = materializeFixture(now);
    const { api } = makeFakeApi(fixture);
    const snap = await fetchActualSnapshot({ env: BASE_ENV, api, now });
    const checking = snap.accounts.find((a) => a.name === 'Sample Checking');
    expect(checking.balance).toBe(15000);
    const cc = snap.accounts.find((a) => a.name === 'Sample Credit Card');
    expect(cc.balance).toBe(-1200);
  });

  it('fetches balance via getAccountBalance once per account', async () => {
    // Regression guard: getAccounts() does not populate a usable balance, so
    // the snapshot must call getAccountBalance(id) for every account.
    const fixture = materializeFixture(now);
    const { api, calls } = makeFakeApi(fixture);
    await fetchActualSnapshot({ env: BASE_ENV, api, now });
    const expectedIds = fixture.getAccounts.map((a) => a.id);
    expect(calls.getAccountBalance.sort()).toEqual([...expectedIds].sort());
  });

  it('uses getAccountBalance, NOT the stale getAccounts().balance field', async () => {
    // The whole point of the fix: getAccounts().balance is unreliable
    // (null/wrong for off-budget accounts). Here the stale field says
    // $15,000 but the authoritative getAccountBalance says $99,999 — the
    // snapshot must reflect the authoritative value.
    const fixture = materializeFixture(now);
    const { api } = makeFakeApi(fixture, { balances: { 'acct-checking': 9999900 } });
    const snap = await fetchActualSnapshot({ env: BASE_ENV, api, now });
    const checking = snap.accounts.find((a) => a.name === 'Sample Checking');
    expect(checking.balance).toBe(99999);
  });

  it('rolls up category spend, excluding income/transfers/uncategorized', async () => {
    const fixture = materializeFixture(now);
    const { api } = makeFakeApi(fixture);
    const snap = await fetchActualSnapshot({ env: BASE_ENV, api, now });
    const names = snap.categorySpend90d.map((c) => c.name);
    expect(names).not.toContain('Salary'); // income excluded
    expect(names).toContain('Groceries');
    expect(names).toContain('Tithing');
    // Restaurants spend across checking + cc
    const restaurants = snap.categorySpend90d.find((c) => c.name === 'Restaurants');
    expect(restaurants.txnCount).toBe(2);
    expect(restaurants.total).toBe(150); // 8000 + 7000 cents -> $150
  });

  it('produces sanity checks reflecting the fixture state', async () => {
    const fixture = materializeFixture(now);
    const { api } = makeFakeApi(fixture);
    const snap = await fetchActualSnapshot({ env: BASE_ENV, api, now });
    // Fixture has: one "Transfer to Savings" payee with no transfer_id (unmarked),
    //              one Mystery Vendor with category null (uncategorized),
    //              one stale TSP account.
    expect(snap.sanityChecks.unmarkedTransfers).toBe(1);
    expect(snap.sanityChecks.uncategorized).toBe(1);
    expect(snap.sanityChecks.staleAccounts.map((a) => a.name)).toEqual(['Sample TSP']);
  });

  it('passes init() the configured serverURL, password, and dataDir', async () => {
    const fixture = materializeFixture(now);
    const { api, calls } = makeFakeApi(fixture);
    await fetchActualSnapshot({
      env: { ...BASE_ENV, ACTUAL_SERVER: 'http://x:1', ACTUAL_DATA_DIR: '/d' },
      api,
      now,
    });
    expect(calls.init[0]).toEqual({
      dataDir: '/d',
      serverURL: 'http://x:1',
      password: 'secret',
    });
  });
});
