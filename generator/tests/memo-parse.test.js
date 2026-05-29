import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';

import {
  parseInlineTags,
  parseMoney,
  parseSplits,
  splitDisplayName,
  parseMarkdownTables,
  findSectionTable,
  parseAccountsTable,
  parseIncomeTable,
  parseMemo,
} from '../src/sources/memo.js';

const FIXTURE = resolve(import.meta.dirname, 'fixtures/memo.sample.md');

describe('parseInlineTags', () => {
  it('extracts a single tag', () => {
    expect(parseInlineTags('Operating cash [type:checking]')).toEqual({
      tags: { type: 'checking' },
      prose: 'Operating cash',
    });
  });

  it('extracts multiple tags', () => {
    const { tags, prose } = parseInlineTags(
      'Past surrender period — rolling. [status:pending-out] [type:roth-ira]',
    );
    expect(tags).toEqual({ status: 'pending-out', type: 'roth-ira' });
    expect(prose).toBe('Past surrender period — rolling.');
  });

  it('is case-insensitive on keys', () => {
    expect(parseInlineTags('[TYPE:401k]').tags).toEqual({ type: '401k' });
  });

  it('preserves prose around tags', () => {
    const { tags, prose } = parseInlineTags('foo [a:1] bar [b:2] baz');
    expect(tags).toEqual({ a: '1', b: '2' });
    expect(prose).toBe('foo bar baz');
  });

  it('returns empty result for null/empty input', () => {
    expect(parseInlineTags('')).toEqual({ tags: {}, prose: '' });
    expect(parseInlineTags(null)).toEqual({ tags: {}, prose: '' });
  });

  it('leaves unmatched brackets alone', () => {
    const { tags, prose } = parseInlineTags('this is [not a tag] in prose');
    expect(tags).toEqual({});
    expect(prose).toBe('this is [not a tag] in prose');
  });

  it('handles values with internal spaces', () => {
    expect(parseInlineTags('[note:two words]').tags).toEqual({ note: 'two words' });
  });
});

describe('parseMoney', () => {
  it('parses plain dollar amounts', () => {
    expect(parseMoney('$1,234.56')).toEqual({ amount: 1234.56, asOf: null });
  });

  it('parses with leading tilde', () => {
    expect(parseMoney('~$45,000')).toEqual({ amount: 45000, asOf: null });
  });

  it('parses k suffix', () => {
    expect(parseMoney('~$738k')).toEqual({ amount: 738000, asOf: null });
  });

  it('parses M suffix', () => {
    expect(parseMoney('$1.2M')).toEqual({ amount: 1200000, asOf: null });
  });

  it('parses zero', () => {
    expect(parseMoney('$0')).toEqual({ amount: 0, asOf: null });
  });

  it('extracts MM/DD/YYYY date from parens', () => {
    expect(parseMoney('$500,000 (12/31/2025)')).toEqual({
      amount: 500000,
      asOf: '2025-12-31',
    });
  });

  it('extracts YYYY-MM-DD date from parens', () => {
    expect(parseMoney('$500 (2025-12-31)')).toEqual({ amount: 500, asOf: '2025-12-31' });
  });

  it('handles bold-wrapped values', () => {
    expect(parseMoney('**~$1,300,000**')).toEqual({ amount: 1300000, asOf: null });
  });

  it('takes the first value when multiple present', () => {
    expect(parseMoney('Est. value ~$700k, equity ~$400k')).toEqual({
      amount: 700000,
      asOf: null,
    });
  });

  it('returns null for empty / non-numeric input', () => {
    expect(parseMoney('')).toEqual({ amount: null, asOf: null });
    expect(parseMoney(null)).toEqual({ amount: null, asOf: null });
    expect(parseMoney('see notes')).toEqual({ amount: null, asOf: null });
  });

  it('handles prose tail after the amount', () => {
    expect(parseMoney('$0 (pending MassMutual transfer ~$82k)')).toEqual({
      amount: 0,
      asOf: null,
    });
  });

  it('does not let date digits leak into the money parse', () => {
    expect(parseMoney('$1,013,237 (12/31/2025)')).toEqual({
      amount: 1013237,
      asOf: '2025-12-31',
    });
  });

  it('returns null for a number without a $ sign (loyalty points etc.)', () => {
    // Capital One Miles row is "~700,000" — should NOT be read as $700,000.
    expect(parseMoney('~700,000')).toEqual({ amount: null, asOf: null });
    expect(parseMoney('700000')).toEqual({ amount: null, asOf: null });
  });
});

describe('parseSplits', () => {
  it('parses TSP-style splits', () => {
    const splits = parseSplits(
      'Traditional $487,766 / Roth $190,836 / Agency $266,832 / Auto 1% $67,803',
    );
    expect(splits).toEqual({
      traditional: 487766,
      roth: 190836,
      agency: 266832,
      auto_1pct: 67803,
    });
  });

  it('returns null when no slash-separated $ pattern present', () => {
    expect(parseSplits('Operating cash')).toBeNull();
    expect(parseSplits('Some prose with one $100 amount and no splits')).toBeNull();
    expect(parseSplits('')).toBeNull();
    expect(parseSplits(null)).toBeNull();
  });

  it('handles two-way splits', () => {
    expect(parseSplits('Traditional $100 / Roth $200')).toEqual({
      traditional: 100,
      roth: 200,
    });
  });

  it('does not treat $N/mo or $N/yr as a split separator', () => {
    // Real estate notes contain "$2,988.85/mo" and "$2,000/mo" — these are
    // unit suffixes, not list separators. The gate requires spaces around /.
    expect(parseSplits('Mortgage $328,325 @ 2.99%, payment $2,988.85/mo')).toBeNull();
    expect(parseSplits('Renting $2,000/mo (Zillow est. $3,092/mo)')).toBeNull();
  });
});

describe('splitDisplayName', () => {
  it('splits "Name — ACCT123"', () => {
    expect(splitDisplayName('Sample Roth IRA — ACCT12345')).toEqual({
      displayName: 'Sample Roth IRA',
      accountNumber: 'ACCT12345',
    });
  });

  it('strips an Acct prefix on the identifier', () => {
    expect(splitDisplayName('Vanguard Brokerage — Acct 30575817')).toEqual({
      displayName: 'Vanguard Brokerage',
      accountNumber: '30575817',
    });
  });

  it('returns the name unchanged when no dash-identifier suffix', () => {
    expect(splitDisplayName('TSP (Lifecycle 50/50)')).toEqual({
      displayName: 'TSP (Lifecycle 50/50)',
      accountNumber: null,
    });
  });

  it('handles empty input', () => {
    expect(splitDisplayName('')).toEqual({ displayName: '', accountNumber: null });
  });
});

describe('parseMarkdownTables', () => {
  it('parses a single table', () => {
    const md = ['| a | b |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |'].join('\n');
    const tables = parseMarkdownTables(md);
    expect(tables).toHaveLength(1);
    expect(tables[0].header).toEqual(['a', 'b']);
    expect(tables[0].rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('finds multiple tables in one document', () => {
    const md = [
      'intro',
      '| a |',
      '|---|',
      '| 1 |',
      '',
      'middle text',
      '',
      '| x | y |',
      '|---|---|',
      '| q | r |',
    ].join('\n');
    const tables = parseMarkdownTables(md);
    expect(tables).toHaveLength(2);
  });

  it('returns empty array when no tables present', () => {
    expect(parseMarkdownTables('just prose, no tables here')).toEqual([]);
  });

  it('ignores pipe-prefixed lines without a separator row', () => {
    expect(parseMarkdownTables('| this is | not a table |')).toEqual([]);
  });
});

describe('findSectionTable', () => {
  it('locates the table inside a named section', () => {
    const md = [
      '## Other',
      '',
      'prose',
      '',
      '## Assets',
      '',
      '| Account | Balance |',
      '|---|---|',
      '| A | $1 |',
      '',
      '## Income',
      '',
      '| Source | Amount |',
      '|---|---|',
      '| S | $10 |',
    ].join('\n');
    const table = findSectionTable(md, 'Assets');
    expect(table.header).toEqual(['Account', 'Balance']);
    expect(table.rows).toEqual([['A', '$1']]);
  });

  it('returns null when the section is absent', () => {
    const md = ['## Other', '', '| a |', '|---|', '| 1 |'].join('\n');
    expect(findSectionTable(md, 'Assets')).toBeNull();
  });

  it('returns the first table when the section has multiple', () => {
    const md = [
      '## Assets',
      '',
      '| Account | Balance |',
      '|---|---|',
      '| A | $1 |',
      '',
      'prose',
      '',
      '| Other | Table |',
      '|---|---|',
      '| x | y |',
    ].join('\n');
    const table = findSectionTable(md, 'Assets');
    expect(table.header).toEqual(['Account', 'Balance']);
  });

  it('handles section names with parens', () => {
    const md = [
      '## Income Picture (Monthly)',
      '',
      '| Source | Amount |',
      '|---|---|',
      '| Salary | $10 |',
    ].join('\n');
    const table = findSectionTable(md, 'Income Picture (Monthly)');
    expect(table).not.toBeNull();
    expect(table.rows).toEqual([['Salary', '$10']]);
  });
});

describe('parseAccountsTable', () => {
  it('throws helpfully when required columns missing', () => {
    expect(() => parseAccountsTable({ header: ['Foo', 'Bar'], rows: [] })).toThrow(
      /Account.+Balance/,
    );
  });

  it('returns [] for null table', () => {
    expect(parseAccountsTable(null)).toEqual([]);
  });

  it('skips bold summary rows', () => {
    const table = {
      header: ['Account', 'Balance', 'Notes'],
      rows: [
        ['Sample', '$100', ''],
        ['**Total**', '**$100**', ''],
      ],
    };
    const accounts = parseAccountsTable(table);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].displayName).toBe('Sample');
  });

  it('skips blank rows', () => {
    const table = {
      header: ['Account', 'Balance'],
      rows: [['', '']],
    };
    expect(parseAccountsTable(table)).toEqual([]);
  });
});

describe('parseIncomeTable', () => {
  it('throws helpfully when required columns missing', () => {
    expect(() => parseIncomeTable({ header: ['Foo'], rows: [] })).toThrow(/Source.+Amount/);
  });

  it('returns [] for null table', () => {
    expect(parseIncomeTable(null)).toEqual([]);
  });
});

describe('parseMemo (integration against fixture)', () => {
  it('returns the expected MemoSnapshot shape', async () => {
    const snapshot = await parseMemo(FIXTURE);
    expect(snapshot.sourcePath).toBe(FIXTURE);
    expect(snapshot.sourceSha).toMatch(/^[0-9a-f]{64}$/);
    expect(Array.isArray(snapshot.accounts)).toBe(true);
    expect(Array.isArray(snapshot.income)).toBe(true);
    expect(snapshot.milestones).toEqual([]);
  });

  it('parses all non-summary accounts from the fixture', async () => {
    const { accounts } = await parseMemo(FIXTURE);
    expect(accounts).toHaveLength(9);
  });

  it('parses TSP-like account with splits and tags', async () => {
    const { accounts } = await parseMemo(FIXTURE);
    const tsp = accounts.find((a) => a.displayName.startsWith('Sample TSP'));
    expect(tsp).toBeDefined();
    expect(tsp.balance).toBe(500000);
    expect(tsp.asOf).toBe('2025-12-31');
    expect(tsp.type).toBe('401k');
    expect(tsp.growthAssumption).toBe(0.07);
    expect(tsp.owner).toBe('self');
    expect(tsp.splits).toEqual({
      traditional: 250000,
      roth: 150000,
      agency: 80000,
      auto_1pct: 20000,
    });
  });

  it('captures pending-transfer status on the roth-out account', async () => {
    const { accounts } = await parseMemo(FIXTURE);
    const out = accounts.find((a) => a.displayName.startsWith('Sample Roth IRA'));
    expect(out.status).toBe('pending-out');
    expect(out.accountNumber).toBe('ACCT12345');
    expect(out.balance).toBe(80000);
  });

  it('handles the receiving Vanguard placeholder ($0 with pending-in)', async () => {
    const { accounts } = await parseMemo(FIXTURE);
    const vg = accounts.find((a) => a.displayName.startsWith('Vanguard Roth'));
    expect(vg.balance).toBe(0);
    expect(vg.status).toBe('pending-in');
  });

  it('parses k-suffix property values', async () => {
    const { accounts } = await parseMemo(FIXTURE);
    const home = accounts.find((a) => a.displayName === 'Primary Home');
    expect(home.balance).toBe(700000);
    expect(home.type).toBe('real-estate');
    expect(home.notes).toContain('Mortgage');
  });

  it('parses income streams from the fixture', async () => {
    const { income } = await parseMemo(FIXTURE);
    expect(income).toHaveLength(4);
    const salary = income.find((i) => i.source === 'Salary');
    expect(salary.monthly).toBe(10000);
    const rental = income.find((i) => i.source === 'Rental');
    expect(rental.monthly).toBe(2000);
  });

  it('preserves raw balance string for audit', async () => {
    const { accounts } = await parseMemo(FIXTURE);
    const tsp = accounts.find((a) => a.displayName.startsWith('Sample TSP'));
    expect(tsp.balanceRaw).toBe('$500,000 (12/31/2025)');
  });

  it('produces deterministic sha on the same content', async () => {
    const a = await parseMemo(FIXTURE);
    const b = await parseMemo(FIXTURE);
    expect(a.sourceSha).toBe(b.sourceSha);
  });
});
