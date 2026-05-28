import { describe, expect, it } from 'vitest';
import {
  countPlanEntities,
  findById,
  groupByType,
  summarizeToday,
} from '../../userscript/src/account-mapping.js';
import { makeValidPlan } from '../setup.js';

const sampleToday = {
  savingsAccounts: [
    { id: 'a1', name: 'HYSA', type: 'savings', balance: 50000 },
    { id: 'a2', name: 'Checking', type: 'checking', balance: 5000 },
  ],
  investmentAccounts: [
    { id: 'b1', name: 'IRA', type: 'ira', balance: 250000 },
    { id: 'b2', name: 'Roth IRA', type: 'roth-ira', balance: 150000 },
    { id: 'b3', name: 'Taxable', type: 'taxable', balance: 100000 },
  ],
  debts: [{ id: 'd1', name: 'Mortgage', type: 'mortgage', balance: 200000 }],
  assets: [{ id: 'h1', name: 'Home', type: 'home', balance: 400000 }],
};

describe('summarizeToday', () => {
  it('counts each account type bucket', () => {
    const s = summarizeToday(sampleToday);
    expect(s.savingsCount).toBe(2);
    expect(s.investmentCount).toBe(3);
    expect(s.debtCount).toBe(1);
    expect(s.assetCount).toBe(1);
    expect(s.accountCount).toBe(5); // savings + investments
  });

  it('sums balances correctly', () => {
    const s = summarizeToday(sampleToday);
    expect(s.totalCash).toBe(55000);
    expect(s.totalInvested).toBe(500000);
    expect(s.totalDebt).toBe(200000);
    expect(s.totalAssetValue).toBe(400000);
    expect(s.netWorth).toBe(55000 + 500000 + 400000 - 200000); // 755000
  });

  it('handles missing/null input gracefully', () => {
    const empty = summarizeToday(null);
    expect(empty.accountCount).toBe(0);
    expect(empty.netWorth).toBe(0);
  });

  it('treats missing buckets as empty arrays', () => {
    const partial = summarizeToday({
      savingsAccounts: [{ id: 'a', name: 'A', type: 'savings', balance: 1 }],
    });
    expect(partial.totalCash).toBe(1);
    expect(partial.totalInvested).toBe(0);
    expect(partial.debtCount).toBe(0);
  });

  it('treats non-numeric balances as zero', () => {
    const s = summarizeToday({
      savingsAccounts: [{ id: 'a', name: 'A', type: 'savings', balance: 'oops' }],
      investmentAccounts: [],
      debts: [],
      assets: [],
    });
    expect(s.totalCash).toBe(0);
  });
});

describe('groupByType', () => {
  it('groups accounts by their type', () => {
    const g = groupByType(sampleToday.investmentAccounts);
    expect(Object.keys(g).sort()).toEqual(['ira', 'roth-ira', 'taxable']);
    expect(g.ira).toHaveLength(1);
    expect(g.taxable).toHaveLength(1);
  });

  it('buckets missing types under "unknown"', () => {
    const g = groupByType([{ id: 'x', name: 'X', balance: 0 }]);
    expect(g.unknown).toHaveLength(1);
  });

  it('handles null input', () => {
    expect(groupByType(null)).toEqual({});
  });
});

describe('findById', () => {
  it('finds an account in savings', () => {
    expect(findById(sampleToday, 'a1')).toEqual({
      bucket: 'savingsAccounts',
      item: sampleToday.savingsAccounts[0],
    });
  });

  it('finds an account in investments', () => {
    expect(findById(sampleToday, 'b2')).toEqual({
      bucket: 'investmentAccounts',
      item: sampleToday.investmentAccounts[1],
    });
  });

  it('finds debts and assets', () => {
    expect(findById(sampleToday, 'd1').bucket).toBe('debts');
    expect(findById(sampleToday, 'h1').bucket).toBe('assets');
  });

  it('returns null for unknown id', () => {
    expect(findById(sampleToday, 'nope')).toBeNull();
  });

  it('returns null for falsy id', () => {
    expect(findById(sampleToday, '')).toBeNull();
    expect(findById(sampleToday, null)).toBeNull();
  });
});

describe('countPlanEntities', () => {
  it('counts entities across all plans', () => {
    const plan = makeValidPlan();
    plan.plans[0].income.events = [
      { id: 'i1', name: 'salary' },
      { id: 'i2', name: 'pension' },
    ];
    plan.plans[0].expenses.events = [{ id: 'e1', name: 'rent' }];
    const c = countPlanEntities(plan);
    expect(c.planCount).toBe(1);
    expect(c.milestones).toBe(1); // from makeValidPlan default
    expect(c.income).toBe(2);
    expect(c.expenses).toBe(1);
  });

  it('sums across multiple plans', () => {
    const plan = makeValidPlan({
      plans: [
        { id: 'p1', name: 'A', milestones: [{ id: 'm', name: 'M' }] },
        {
          id: 'p2',
          name: 'B',
          milestones: [
            { id: 'm2', name: 'M2' },
            { id: 'm3', name: 'M3' },
          ],
        },
      ],
    });
    const c = countPlanEntities(plan);
    expect(c.planCount).toBe(2);
    expect(c.milestones).toBe(3);
  });

  it('returns zeros for an empty plan', () => {
    expect(countPlanEntities({ plans: [] })).toEqual({
      planCount: 0,
      milestones: 0,
      income: 0,
      expenses: 0,
      accountEvents: 0,
      assetEvents: 0,
    });
  });
});
