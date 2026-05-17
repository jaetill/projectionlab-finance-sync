import { describe, expect, it } from 'vitest';
import { resolveAccountId, resolvePlanAccounts } from '../../userscript/src/account-mapping.js';

const plAccounts = [
  { id: 'acc_taxable', name: 'Acme Brokerage Taxable' },
  { id: 'acc_401k', name: 'Acme 401(k)' },
  { id: 'acc_hysa', name: 'Acme HYSA' },
];

describe('resolveAccountId', () => {
  it('returns null when name is empty', () => {
    expect(resolveAccountId('', {}, plAccounts)).toBeNull();
    expect(resolveAccountId(null, {}, plAccounts)).toBeNull();
  });

  it('honors an explicit accountMap override', () => {
    expect(
      resolveAccountId('Anything Goes Here', { 'Anything Goes Here': 'acc_special' }, plAccounts),
    ).toBe('acc_special');
  });

  it('treats an empty-string accountMap value as null (explicit deny)', () => {
    expect(
      resolveAccountId('Acme Brokerage Taxable', { 'Acme Brokerage Taxable': '' }, plAccounts),
    ).toBeNull();
  });

  it('matches by exact name', () => {
    expect(resolveAccountId('Acme Brokerage Taxable', {}, plAccounts)).toBe('acc_taxable');
  });

  it('matches case-insensitively', () => {
    expect(resolveAccountId('acme brokerage taxable', {}, plAccounts)).toBe('acc_taxable');
  });

  it('falls back to substring match (plan-name contains PL-name)', () => {
    expect(resolveAccountId('Acme 401(k) Retirement', {}, plAccounts)).toBe('acc_401k');
  });

  it('falls back to substring match (PL-name contains plan-name)', () => {
    expect(resolveAccountId('HYSA', {}, plAccounts)).toBe('acc_hysa');
  });

  it('returns null when nothing matches', () => {
    expect(resolveAccountId('Vanguard IRA', {}, plAccounts)).toBeNull();
  });

  it('returns null when plAccounts is missing', () => {
    expect(resolveAccountId('Whatever', {}, undefined)).toBeNull();
  });
});

describe('resolvePlanAccounts', () => {
  it('partitions plan accounts into resolved and unresolved', () => {
    const plan = {
      accounts: [
        { name: 'Acme Brokerage Taxable', type: 'TAXABLE_BROKERAGE', balance: 100 },
        { name: 'Unknown Account', type: 'CHECKING', balance: 50 },
        { name: 'Acme HYSA', type: 'SAVINGS', balance: 200 },
      ],
    };
    const { resolved, unresolved } = resolvePlanAccounts(plan, {}, plAccounts);
    expect(resolved.map((r) => r.id)).toEqual(['acc_taxable', 'acc_hysa']);
    expect(unresolved.map((u) => u.name)).toEqual(['Unknown Account']);
  });

  it('handles an empty plan gracefully', () => {
    expect(resolvePlanAccounts({}, {}, plAccounts)).toEqual({ resolved: [], unresolved: [] });
  });
});
