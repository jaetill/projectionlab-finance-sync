import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  reconcile,
  slugify,
  externalIdForMemo,
  classifyDriftBucket,
  matchAccounts,
  computeAccountDrift,
} from '../src/reconcile.js';

const RULES = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '..', 'config/reconcile-rules.json'), 'utf8'),
);

// ---------------------------------------------------------------------------
// Helper-level unit tests
// ---------------------------------------------------------------------------

describe('slugify', () => {
  it('lowercases and collapses non-alphanumerics', () => {
    expect(slugify('TSP (L2035/L2040 50/50)')).toBe('tsp-l2035-l2040-50-50');
  });

  it('strips leading/trailing dashes', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world');
  });

  it('handles empty input', () => {
    expect(slugify('')).toBe('');
    expect(slugify(null)).toBe('');
  });
});

describe('externalIdForMemo', () => {
  it('uses uuid tag when present', () => {
    expect(externalIdForMemo({ displayName: 'X', uuid: 'abc-123' })).toBe('abc-123');
  });

  it('falls back to slug of displayName', () => {
    expect(externalIdForMemo({ displayName: 'Sample TSP' })).toBe('sample-tsp');
  });

  it('returns empty string on empty memo', () => {
    expect(externalIdForMemo({})).toBe('');
  });
});

describe('classifyDriftBucket', () => {
  it('maps known types to specific buckets', () => {
    expect(classifyDriftBucket('checking', null)).toBe('checking');
    expect(classifyDriftBucket('savings', null)).toBe('savings');
    expect(classifyDriftBucket('cd', null)).toBe('cd');
    expect(classifyDriftBucket('credit', null)).toBe('creditCard');
    expect(classifyDriftBucket('credit-card', null)).toBe('creditCard');
  });

  it('falls back to category mapping for unknown types', () => {
    expect(classifyDriftBucket('401k', 'investment')).toBe('investment');
    expect(classifyDriftBucket(null, 'investment')).toBe('investment');
    expect(classifyDriftBucket(null, 'debt')).toBe('creditCard');
  });

  it('defaults to investment (always-log) when nothing matches', () => {
    expect(classifyDriftBucket(null, null)).toBe('investment');
    expect(classifyDriftBucket('something-weird', null)).toBe('investment');
  });
});

describe('matchAccounts', () => {
  const memoAccounts = [
    { displayName: 'Sample Checking', type: 'checking' },
    { displayName: 'Sample TSP', type: '401k' },
    { displayName: 'Memo Only Account', type: 'brokerage' },
  ];

  it('pairs by exact name match (case-insensitive)', () => {
    const actualAccounts = [{ actualId: 'a1', name: 'sample checking', balance: 1000 }];
    const { pairs } = matchAccounts(memoAccounts, actualAccounts);
    const checking = pairs.find((p) => p.memo.displayName === 'Sample Checking');
    expect(checking.actual?.actualId).toBe('a1');
  });

  it('falls back to substring match when no exact (memo name is a superset)', () => {
    // Real-world: memo "TSP (L2035/L2040 50/50)" should match Actual "TSP".
    // Substring match works when one name fully contains the other.
    const memos = [{ displayName: 'TSP (Lifecycle 50/50)', type: '401k' }];
    const actualAccounts = [{ actualId: 'a1', name: 'TSP', balance: 5 }];
    const { pairs } = matchAccounts(memos, actualAccounts);
    expect(pairs[0].actual?.actualId).toBe('a1');
  });

  it('substring match also works when Actual name is the superset', () => {
    const memos = [{ displayName: 'Checking', type: 'checking' }];
    const actualAccounts = [{ actualId: 'a1', name: 'Sample Family Checking', balance: 5 }];
    const { pairs } = matchAccounts(memos, actualAccounts);
    expect(pairs[0].actual?.actualId).toBe('a1');
  });

  it('honors explicit accountMapping override', () => {
    const actualAccounts = [
      { actualId: 'a1', name: 'Sample Checking', balance: 100 },
      { actualId: 'a2', name: 'Different Name Entirely', balance: 9999 },
    ];
    const rules = {
      accountMapping: { 'sample-tsp': { actualId: 'a2' } },
    };
    const { pairs } = matchAccounts(memoAccounts, actualAccounts, rules);
    const tsp = pairs.find((p) => p.memo.displayName === 'Sample TSP');
    expect(tsp.actual?.actualId).toBe('a2');
  });

  it('leaves memo accounts without a match unpaired', () => {
    const { pairs } = matchAccounts(memoAccounts, []);
    expect(pairs.every((p) => p.actual === null || p.actual === undefined)).toBe(true);
  });

  it('reports Actual accounts that no memo entry claims', () => {
    const actualAccounts = [{ actualId: 'orphan', name: 'Mystery Brokerage', balance: 99 }];
    const { actualOnly } = matchAccounts(memoAccounts, actualAccounts);
    expect(actualOnly).toHaveLength(1);
    expect(actualOnly[0].actualId).toBe('orphan');
  });

  it('does not pair the same Actual account to two memo accounts', () => {
    const memos = [{ displayName: 'Foo' }, { displayName: 'Foo Two' }];
    const actuals = [{ actualId: 'a1', name: 'Foo', balance: 1 }];
    const { pairs } = matchAccounts(memos, actuals);
    const paired = pairs.filter((p) => p.actual);
    expect(paired).toHaveLength(1);
  });
});

describe('computeAccountDrift', () => {
  it('returns null when balances match exactly', () => {
    expect(
      computeAccountDrift('a', { balance: 100, type: 'checking' }, { balance: 100 }, RULES),
    ).toBeNull();
  });

  it('returns null when delta is within threshold', () => {
    // checking threshold = $100; $50 delta should NOT drift
    const out = computeAccountDrift(
      'chk',
      { balance: 1000, type: 'checking' },
      { balance: 1050 },
      RULES,
    );
    expect(out).toBeNull();
  });

  it('returns a drift entry when delta exceeds threshold', () => {
    const out = computeAccountDrift(
      'chk',
      { balance: 1000, type: 'checking' },
      { balance: 1500 },
      RULES,
    );
    expect(out).toMatchObject({
      externalId: 'chk',
      field: 'balance',
      memoValue: 1000,
      trackerValue: 1500,
      delta: 500,
      bucket: 'checking',
      status: 'drifted',
    });
  });

  it('always logs drift for investment accounts (threshold 0)', () => {
    const out = computeAccountDrift(
      'tsp',
      { balance: 1000, type: '401k' },
      { balance: 1001 },
      RULES,
    );
    expect(out).not.toBeNull();
    expect(out.delta).toBe(1);
  });

  it('returns null when either side has no numeric balance', () => {
    expect(
      computeAccountDrift('x', { balance: null, type: 'checking' }, { balance: 100 }, RULES),
    ).toBeNull();
    expect(
      computeAccountDrift('x', { balance: 100, type: 'checking' }, { balance: null }, RULES),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// reconcile() integration tests
// ---------------------------------------------------------------------------

describe('reconcile (integration)', () => {
  const memoSnapshot = {
    accounts: [
      {
        displayName: 'Sample Checking',
        type: 'checking',
        owner: 'joint',
        balance: 16000,
        asOf: null,
      },
      {
        displayName: 'Sample TSP',
        type: '401k',
        owner: 'self',
        balance: 500000,
        asOf: '2025-12-31',
        growthAssumption: 0.07,
        splits: { traditional: 250000, roth: 150000 },
      },
      {
        displayName: 'Memo-Only Real Estate',
        type: 'real-estate',
        owner: 'joint',
        balance: 700000,
        asOf: null,
      },
    ],
  };

  const actualSnapshot = {
    accounts: [
      { actualId: 'a-chk', name: 'Sample Checking', type: 'checking', balance: 14842 },
      { actualId: 'a-tsp', name: 'Sample TSP', type: 'investment', balance: 525000 },
    ],
    sanityChecks: { unmarkedTransfers: 0, uncategorized: 0, staleAccounts: [] },
  };

  it('produces the expected top-level shape', () => {
    const out = reconcile({ memo: memoSnapshot, actual: actualSnapshot, rules: RULES });
    expect(out).toMatchObject({
      accounts: expect.any(Array),
      drift: expect.any(Array),
      provenance: expect.any(Array),
      unmatchedMemo: expect.any(Array),
      unmatchedActual: expect.any(Array),
    });
    expect(out.sanityChecks).toEqual(actualSnapshot.sanityChecks);
  });

  it('uses tracker balance when memo and tracker disagree', () => {
    const out = reconcile({ memo: memoSnapshot, actual: actualSnapshot, rules: RULES });
    const chk = out.accounts.find((a) => a.displayName === 'Sample Checking');
    expect(chk.balance).toBe(14842);
    expect(chk.source).toBe('tracker');
  });

  it('falls back to memo balance when not in tracker', () => {
    const out = reconcile({ memo: memoSnapshot, actual: actualSnapshot, rules: RULES });
    const re = out.accounts.find((a) => a.displayName === 'Memo-Only Real Estate');
    expect(re.balance).toBe(700000);
    expect(re.source).toBe('memo');
  });

  it('logs drift when delta exceeds threshold', () => {
    const out = reconcile({ memo: memoSnapshot, actual: actualSnapshot, rules: RULES });
    // TSP: $500k memo vs $525k tracker → +$25k, investment threshold 0 → drift
    const tsp = out.drift.find((d) => d.externalId === 'sample-tsp');
    expect(tsp).toBeDefined();
    expect(tsp.delta).toBe(25000);
    // Checking: $16k memo vs $14,842 tracker → -$1,158, threshold $100 → drift
    const chk = out.drift.find((d) => d.externalId === 'sample-checking');
    expect(chk).toBeDefined();
    expect(chk.delta).toBe(-1158);
  });

  it('preserves memo splits and growth assumption', () => {
    const out = reconcile({ memo: memoSnapshot, actual: actualSnapshot, rules: RULES });
    const tsp = out.accounts.find((a) => a.displayName === 'Sample TSP');
    expect(tsp.splits).toEqual({ traditional: 250000, roth: 150000 });
    expect(tsp.growthAssumption).toBe(0.07);
  });

  it('flags accounts in tracker but not in memo', () => {
    const withOrphan = {
      ...actualSnapshot,
      accounts: [
        ...actualSnapshot.accounts,
        { actualId: 'a-mystery', name: 'Mystery Account', type: 'checking', balance: 100 },
      ],
    };
    const out = reconcile({ memo: memoSnapshot, actual: withOrphan, rules: RULES });
    expect(out.unmatchedActual).toContain('Mystery Account');
  });

  it('emits provenance for balance + memo-owned fields', () => {
    const out = reconcile({ memo: memoSnapshot, actual: actualSnapshot, rules: RULES });
    const tspProv = out.provenance.filter((p) => p.externalId === 'sample-tsp');
    const fields = tspProv.map((p) => p.field);
    expect(fields).toContain('balance');
    expect(fields).toContain('displayName');
    expect(fields).toContain('owner');
    expect(fields).toContain('growthAssumption');
    const balProv = tspProv.find((p) => p.field === 'balance');
    expect(balProv.source).toBe('tracker');
  });

  it('handles missing actual snapshot (memo-only run)', () => {
    const out = reconcile({ memo: memoSnapshot, actual: null, rules: RULES });
    expect(out.accounts).toHaveLength(3);
    expect(out.accounts.every((a) => a.source === 'memo')).toBe(true);
    expect(out.drift).toEqual([]);
    expect(out.unmatchedActual).toEqual([]);
  });

  it('throws when memo input is missing', () => {
    expect(() => reconcile({})).toThrow(/memo is required/);
    expect(() => reconcile(null)).toThrow(/memo is required/);
  });

  it('uses manual entries when memo + tracker both lack a balance', () => {
    const memo = {
      accounts: [{ displayName: 'VIP Vanguard', type: 'brokerage', owner: 'self', balance: null }],
    };
    const manual = [
      {
        externalId: 'vip-vanguard',
        displayName: 'VIP Vanguard',
        balance: 4503,
        asOf: '2026-04-01',
      },
    ];
    const out = reconcile({ memo, actual: null, manual, rules: RULES });
    const vip = out.accounts.find((a) => a.displayName === 'VIP Vanguard');
    expect(vip.balance).toBe(4503);
    expect(vip.source).toBe('manual');
    expect(vip.asOf).toBe('2026-04-01');
  });

  it('does not produce drift entries for memo-only accounts (no tracker side)', () => {
    const out = reconcile({ memo: memoSnapshot, actual: actualSnapshot, rules: RULES });
    expect(out.drift.find((d) => d.externalId === 'memo-only-real-estate')).toBeUndefined();
  });
});
