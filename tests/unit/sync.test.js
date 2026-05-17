import { describe, expect, it, vi } from 'vitest';
import { makePluginApiStub } from '../setup.js';
import { syncPlan } from '../../userscript/src/sync.js';

const validPlan = {
  schemaVersion: 1,
  generatedAt: '2026-05-11T00:00:00Z',
  asOfDate: '2026-05-11',
  accounts: [
    {
      name: 'Acme Brokerage Taxable',
      type: 'TAXABLE_BROKERAGE',
      balance: 100000,
      currency: 'USD',
      owner: 'self',
    },
    {
      name: 'Acme 401k',
      type: 'TRADITIONAL_401K',
      balance: 200000,
      currency: 'USD',
      owner: 'self',
    },
  ],
  income: [
    {
      label: 'Day job salary',
      amount: 100000,
      frequency: 'ANNUAL',
      startDate: '2026-01-01',
      endDate: null,
      growthRate: 0.03,
    },
  ],
  expenses: [
    { label: 'Living expenses', amount: 60000, frequency: 'ANNUAL', category: 'ESSENTIAL' },
  ],
  milestones: [{ label: 'Retirement', date: '2040-01-01', kind: 'RETIREMENT' }],
};

describe('syncPlan', () => {
  it('refuses to sync an invalid plan and reports validation errors', async () => {
    const pl = makePluginApiStub();
    const result = await syncPlan({ schemaVersion: 99 }, pl);
    expect(result.ok).toBe(false);
    expect(result.errors[0].scope).toBe('validation');
    expect(pl.getAccounts).not.toHaveBeenCalled();
  });

  it('upserts all unknown accounts on a fresh PL workspace', async () => {
    const pl = makePluginApiStub();
    const result = await syncPlan(validPlan, pl);
    expect(result.ok).toBe(true);
    expect(result.counts.accounts).toBe(0);
    expect(result.unresolved).toHaveLength(2);
    expect(result.unresolved.every((u) => u.kind === 'account')).toBe(true);
  });

  it('uses accountMap overrides to resolve and upsert accounts', async () => {
    const pl = makePluginApiStub({
      getAccounts: vi.fn(async () => [
        {
          id: 'acc_taxable',
          name: 'Acme Brokerage Taxable',
          type: 'TAXABLE_BROKERAGE',
          balance: 50000,
          currency: 'USD',
        },
        {
          id: 'acc_401k',
          name: 'Acme 401k',
          type: 'TRADITIONAL_401K',
          balance: 200000,
          currency: 'USD',
        },
      ]),
    });
    const result = await syncPlan(validPlan, pl);
    expect(result.ok).toBe(true);
    expect(result.counts.accounts).toBe(1);
    expect(result.skipped.accounts).toBe(1);
    expect(pl.setAccount).toHaveBeenCalledTimes(1);
    expect(pl.setAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'acc_taxable', balance: 100000 }),
    );
  });

  it('is a no-op when state already matches (idempotent)', async () => {
    const pl = makePluginApiStub({
      getAccounts: vi.fn(async () => [
        {
          id: 'acc_taxable',
          name: 'Acme Brokerage Taxable',
          type: 'TAXABLE_BROKERAGE',
          balance: 100000,
          currency: 'USD',
        },
        {
          id: 'acc_401k',
          name: 'Acme 401k',
          type: 'TRADITIONAL_401K',
          balance: 200000,
          currency: 'USD',
        },
      ]),
      getIncomes: vi.fn(async () => [
        {
          id: 'inc_1',
          label: 'Day job salary',
          amount: 100000,
          frequency: 'ANNUAL',
          startDate: '2026-01-01',
        },
      ]),
      getExpenses: vi.fn(async () => [
        {
          id: 'exp_1',
          label: 'Living expenses',
          amount: 60000,
          frequency: 'ANNUAL',
          category: 'ESSENTIAL',
        },
      ]),
      getMilestones: vi.fn(async () => [
        { id: 'm_1', label: 'Retirement', date: '2040-01-01', kind: 'RETIREMENT' },
      ]),
    });
    const result = await syncPlan(validPlan, pl);
    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({ accounts: 0, milestones: 0, income: 0, expenses: 0 });
    expect(result.skipped).toEqual({ accounts: 2, milestones: 1, income: 1, expenses: 1 });
    expect(pl.setAccount).not.toHaveBeenCalled();
    expect(pl.setIncome).not.toHaveBeenCalled();
    expect(pl.setExpense).not.toHaveBeenCalled();
    expect(pl.setMilestone).not.toHaveBeenCalled();
  });

  it('records per-call errors without aborting the whole sync', async () => {
    const pl = makePluginApiStub({
      getAccounts: vi.fn(async () => [
        {
          id: 'acc_taxable',
          name: 'Acme Brokerage Taxable',
          type: 'TAXABLE_BROKERAGE',
          balance: 0,
          currency: 'USD',
        },
        {
          id: 'acc_401k',
          name: 'Acme 401k',
          type: 'TRADITIONAL_401K',
          balance: 0,
          currency: 'USD',
        },
      ]),
      setAccount: vi.fn(async (a) => {
        if (a.name === 'Acme 401k') throw new Error('401k upstream failure');
        return a;
      }),
    });
    const result = await syncPlan(validPlan, pl);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.scope.includes('Acme 401k'))).toBe(true);
    expect(result.counts.accounts).toBe(1);
  });

  it('records error when getAccounts itself fails', async () => {
    const pl = makePluginApiStub({
      getAccounts: vi.fn(async () => {
        throw new Error('PL is down');
      }),
    });
    const result = await syncPlan(validPlan, pl);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.scope === 'getAccounts')).toBe(true);
  });

  it('stamps startedAt and finishedAt timestamps', async () => {
    const pl = makePluginApiStub();
    const stamps = ['2026-05-11T00:00:00Z', '2026-05-11T00:00:05Z'];
    const result = await syncPlan(validPlan, pl, {}, () => stamps.shift());
    expect(result.startedAt).toBe('2026-05-11T00:00:00Z');
    expect(result.finishedAt).toBe('2026-05-11T00:00:05Z');
  });
});
