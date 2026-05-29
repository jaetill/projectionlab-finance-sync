import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  emit,
  bucketFor,
  newAccountId,
  shapeAccount,
  mergeAccountList,
  loadBase,
} from '../src/emit.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const EXAMPLE_PLAN = resolve(REPO_ROOT, 'data', 'plan.example.json');

// Common reconciled fixture used across the integration tests.
function makeReconciled() {
  return {
    accounts: [
      {
        externalId: 'sample-checking',
        displayName: 'Sample Checking',
        owner: 'joint',
        type: 'checking',
        category: 'cash',
        balance: 16000,
        asOf: null,
        source: 'tracker',
      },
      {
        externalId: 'sample-tsp',
        displayName: 'Sample TSP',
        owner: 'self',
        type: '401k',
        category: 'investment',
        balance: 1054891,
        asOf: '2026-05-28',
        source: 'tracker',
        growthAssumption: 0.07,
        splits: { traditional: 487766, roth: 190836 },
      },
      {
        externalId: 'home',
        displayName: 'Primary Home',
        owner: 'joint',
        type: 'real-estate',
        category: 'asset',
        balance: 700000,
        asOf: null,
        source: 'memo',
      },
    ],
    drift: [{ externalId: 'sample-checking', field: 'balance', delta: -1158, status: 'drifted' }],
    provenance: [{ externalId: 'sample-checking', field: 'balance', source: 'tracker' }],
    sanityChecks: { unmarkedTransfers: 0, uncategorized: 0, staleAccounts: [] },
  };
}

// ---------------------------------------------------------------------------
// Helper-level tests
// ---------------------------------------------------------------------------

describe('bucketFor', () => {
  it('maps known categories to PL buckets', () => {
    expect(bucketFor({ category: 'cash' })).toBe('savingsAccounts');
    expect(bucketFor({ category: 'investment' })).toBe('investmentAccounts');
    expect(bucketFor({ category: 'debt' })).toBe('debts');
    expect(bucketFor({ category: 'asset' })).toBe('assets');
  });

  it('falls back to investmentAccounts for unknown / missing categories', () => {
    expect(bucketFor({ category: 'mystery' })).toBe('investmentAccounts');
    expect(bucketFor({})).toBe('investmentAccounts');
    expect(bucketFor(null)).toBe('investmentAccounts');
  });
});

describe('newAccountId', () => {
  it('prefixes externalId', () => {
    expect(newAccountId('tsp')).toBe('acct-tsp');
  });

  it('handles missing externalId', () => {
    expect(newAccountId('')).toBe('acct-unknown');
    expect(newAccountId(undefined)).toBe('acct-unknown');
  });
});

describe('shapeAccount', () => {
  it('creates a new account with sensible defaults when no existing match', () => {
    const a = shapeAccount(
      { externalId: 'foo', displayName: 'Foo Savings', type: 'savings', balance: 100 },
      null,
      'savingsAccounts',
    );
    expect(a).toMatchObject({
      id: 'acct-foo',
      name: 'Foo Savings',
      type: 'savings',
      balance: 100,
      liquid: true,
    });
    expect(a.color).toBeDefined();
    expect(a.icon).toBeDefined();
  });

  it('keeps existing PL id and merges new balance/name', () => {
    const existing = {
      id: 'pl-uuid-original',
      name: 'Old Name',
      type: 'savings',
      balance: 1,
      color: 'purple',
    };
    const a = shapeAccount(
      { externalId: 'foo', displayName: 'New Name', type: 'savings', balance: 999 },
      existing,
      'savingsAccounts',
    );
    expect(a.id).toBe('pl-uuid-original');
    expect(a.name).toBe('New Name');
    expect(a.balance).toBe(999);
    expect(a.color).toBe('purple');
  });

  it('converts memo growth fraction to PL percent', () => {
    const a = shapeAccount(
      { externalId: 'tsp', displayName: 'TSP', type: '401k', balance: 100, growthAssumption: 0.07 },
      null,
      'investmentAccounts',
    );
    expect(a.investmentGrowthRate).toBeCloseTo(7, 5);
    expect(a.investmentGrowthType).toBe('percent');
  });

  it('infers a type from bucket when reconciled type is null', () => {
    const a = shapeAccount({ externalId: 'x', displayName: 'X', balance: 0 }, null, 'assets');
    expect(a.type).toBe('real-estate');
  });
});

describe('mergeAccountList', () => {
  it('matches reconciled to existing by case-insensitive name', () => {
    const existing = [{ id: 'pl-1', name: 'Sample Checking', type: 'checking', balance: 1 }];
    const reconciled = [
      { externalId: 'chk', displayName: 'sample checking', type: 'checking', balance: 14842 },
    ];
    const out = mergeAccountList(existing, reconciled, 'savingsAccounts');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('pl-1');
    expect(out[0].balance).toBe(14842);
  });

  it('preserves existing accounts not in reconciled by default', () => {
    const existing = [{ id: 'pl-keep', name: 'Untouched Savings', type: 'savings', balance: 500 }];
    const out = mergeAccountList(existing, [], 'savingsAccounts');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('pl-keep');
  });

  it('drops existing accounts when preserveUnmatched is false', () => {
    const existing = [{ id: 'pl-keep', name: 'Untouched Savings', type: 'savings', balance: 500 }];
    const out = mergeAccountList(existing, [], 'savingsAccounts', { preserveUnmatched: false });
    expect(out).toHaveLength(0);
  });

  it('creates new accounts with acct-<externalId> id when no match', () => {
    const existing = [];
    const reconciled = [{ externalId: 'fresh', displayName: 'Fresh', type: 'savings', balance: 1 }];
    const out = mergeAccountList(existing, reconciled, 'savingsAccounts');
    expect(out[0].id).toBe('acct-fresh');
  });
});

// ---------------------------------------------------------------------------
// loadBase tests
// ---------------------------------------------------------------------------

describe('loadBase', () => {
  it('reads the example plan when only basePath omitted and plan.json absent', async () => {
    // In CI / clean checkout, data/plan.json is gitignored; example is fallback.
    // We can't guarantee plan.json absent in a dev tree, so verify the file
    // shape rather than the source path.
    const plan = await loadBase();
    expect(plan).toBeTypeOf('object');
    expect(plan.today).toBeDefined();
    expect(Array.isArray(plan.plans)).toBe(true);
  });

  it('honors an explicit basePath', async () => {
    const plan = await loadBase(EXAMPLE_PLAN);
    expect(plan.today).toBeDefined();
  });

  it('throws when an explicit basePath does not exist', async () => {
    await expect(loadBase('/no/such/path.json')).rejects.toThrow(/not found/);
  });
});

// ---------------------------------------------------------------------------
// emit integration tests
// ---------------------------------------------------------------------------

describe('emit (integration)', () => {
  let tmp;
  let outPath;
  let basePath;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'emit-test-'));
    outPath = join(tmp, 'plan.json');
    basePath = join(tmp, 'base.json');
    // Use the committed example as the base for tests so they don't depend on
    // whatever data/plan.json contains in the dev tree.
    const example = JSON.parse(await readFile(EXAMPLE_PLAN, 'utf8'));
    await writeFile(basePath, JSON.stringify(example));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('writes a valid plan.json with _meta, _drift, _provenance keys', async () => {
    const res = await emit(makeReconciled(), { basePath, outPath });
    expect(res.written).toBe(true);
    expect(res.path).toBe(outPath);
    const plan = JSON.parse(await readFile(outPath, 'utf8'));
    expect(plan._meta).toMatchObject({ schemaVersion: 3, accountsCount: 3 });
    expect(plan._drift).toHaveLength(1);
    expect(plan._provenance).toHaveLength(1);
  });

  it('buckets reconciled accounts into the correct PL arrays', async () => {
    await emit(makeReconciled(), { basePath, outPath });
    const plan = JSON.parse(await readFile(outPath, 'utf8'));
    const savNames = plan.today.savingsAccounts.map((a) => a.name);
    const invNames = plan.today.investmentAccounts.map((a) => a.name);
    const assetNames = plan.today.assets.map((a) => a.name);
    expect(savNames).toContain('Sample Checking');
    expect(invNames).toContain('Sample TSP');
    expect(assetNames).toContain('Primary Home');
  });

  it('preserves the existing plans[] array (the 5 PL scenarios)', async () => {
    await emit(makeReconciled(), { basePath, outPath });
    const example = JSON.parse(await readFile(EXAMPLE_PLAN, 'utf8'));
    const plan = JSON.parse(await readFile(outPath, 'utf8'));
    expect(plan.plans).toHaveLength(example.plans.length);
  });

  it('preserves the existing demographics (yourName, age, etc.)', async () => {
    await emit(makeReconciled(), { basePath, outPath });
    const example = JSON.parse(await readFile(EXAMPLE_PLAN, 'utf8'));
    const plan = JSON.parse(await readFile(outPath, 'utf8'));
    expect(plan.today.yourName).toBe(example.today.yourName);
    expect(plan.today.birthYear).toBe(example.today.birthYear);
  });

  it('does not write in --dry-run mode', async () => {
    // Suppress the JSON dump to stdout — vitest would otherwise print the
    // entire plan in the test output.
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const res = await emit(makeReconciled(), { basePath, outPath, dryRun: true });
      expect(res.written).toBe(false);
      expect(res.path).toBeNull();
      expect(writeSpy).toHaveBeenCalled();
      const { existsSync } = await import('node:fs');
      expect(existsSync(outPath)).toBe(false);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('throws when reconciled input is malformed', async () => {
    await expect(emit(null, { basePath, outPath })).rejects.toThrow(/reconciled view/);
    await expect(emit({}, { basePath, outPath })).rejects.toThrow(/reconciled view/);
  });

  it('treats non-numeric balances as skipped, not a validation error', async () => {
    // Real case: Capital One Miles has "~700,000" with no $, so parseMoney
    // returns balance=null. emit() should skip + report, not crash, not write
    // a malformed plan. (Validator catching this case is unreachable now —
    // the bucketing pre-filter handles it earlier.)
    const recon = {
      accounts: [
        {
          externalId: 'bad-balance',
          displayName: 'Bad Balance',
          category: 'cash',
          balance: 'not a number',
        },
      ],
      drift: [],
      provenance: [],
    };
    const res = await emit(recon, { basePath, outPath });
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0].reason).toBe('no finite balance');
  });

  it('skips reconciled accounts with non-numeric balance and reports them', async () => {
    const recon = makeReconciled();
    recon.accounts.push({
      externalId: 'capital-one-miles',
      displayName: 'Capital One Miles',
      type: null,
      category: null,
      balance: null,
      asOf: null,
      source: 'memo',
    });
    const res = await emit(recon, { basePath, outPath });
    expect(res.written).toBe(true);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]).toMatchObject({
      externalId: 'capital-one-miles',
      reason: 'no finite balance',
    });
  });

  it('preserveUnmatched=false drops PL accounts not in the reconciled view', async () => {
    // The example plan has 1 savings + 3 investment accounts.
    await emit(makeReconciled(), { basePath, outPath, preserveUnmatched: false });
    const plan = JSON.parse(await readFile(outPath, 'utf8'));
    // Reconciled has 1 cash, 1 investment, 1 asset. Debts = 0. With unmatched
    // dropped, savings = 1, investment = 1, assets = 1, debts = 0.
    expect(plan.today.savingsAccounts).toHaveLength(1);
    expect(plan.today.investmentAccounts).toHaveLength(1);
    expect(plan.today.assets).toHaveLength(1);
  });
});
