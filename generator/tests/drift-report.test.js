import { describe, it, expect } from 'vitest';

import { buildDriftReport, fmtMoney, fmtDelta } from '../src/drift-report.js';

const FIXED_NOW = new Date('2026-05-28T14:00:00Z');

function makeRecon(overrides = {}) {
  return {
    accounts: [
      {
        externalId: 'sample-checking',
        displayName: 'Sample Checking',
        type: 'checking',
        category: 'cash',
        balance: 14842,
        asOf: '2026-04-30',
      },
      {
        externalId: 'sample-tsp',
        displayName: 'Sample TSP',
        type: '401k',
        category: 'investment',
        balance: 525000,
        asOf: '2025-12-31',
      },
    ],
    drift: [],
    provenance: [],
    unmatchedMemo: [],
    unmatchedActual: [],
    sanityChecks: { unmarkedTransfers: 0, uncategorized: 0, staleAccounts: [] },
    ...overrides,
  };
}

describe('fmtMoney', () => {
  it('formats positive amounts with $ and grouping', () => {
    expect(fmtMoney(1234567)).toBe('$1,234,567');
  });

  it('formats negative amounts with sign', () => {
    expect(fmtMoney(-1158)).toBe('-$1,158');
  });

  it('shows decimals when present', () => {
    expect(fmtMoney(123.45)).toBe('$123.45');
  });

  it('returns em-dash for null / undefined / NaN', () => {
    expect(fmtMoney(null)).toBe('—');
    expect(fmtMoney(undefined)).toBe('—');
    expect(fmtMoney(NaN)).toBe('—');
  });
});

describe('fmtDelta', () => {
  it('always shows explicit sign', () => {
    expect(fmtDelta(100)).toBe('+$100');
    expect(fmtDelta(-100)).toBe('-$100');
    expect(fmtDelta(0)).toBe('+$0');
  });

  it('em-dashes null/undefined', () => {
    expect(fmtDelta(null)).toBe('—');
  });
});

describe('buildDriftReport (sections)', () => {
  it('produces a meta header with timestamp', () => {
    const md = buildDriftReport(makeRecon(), { now: FIXED_NOW });
    expect(md).toMatch(/# Drift Report/);
    expect(md).toMatch(/2026-05-28T14:00:00\.000Z/);
  });

  it('shows a clean headline when nothing drifted', () => {
    const md = buildDriftReport(makeRecon(), { now: FIXED_NOW });
    expect(md).toMatch(/\*\*0\*\* account drifts/);
    expect(md).toMatch(/\*\*0\*\* memo accounts not seen/);
    expect(md).toMatch(/\*\*0\*\* tracker accounts not in memo/);
  });

  it('renders an "all clean" account drift section when no drift', () => {
    const md = buildDriftReport(makeRecon(), { now: FIXED_NOW });
    expect(md).toMatch(/## Account drift\n\nNo accounts exceeded threshold/);
  });

  it('renders a drift table when there is drift', () => {
    const md = buildDriftReport(
      makeRecon({
        drift: [
          {
            externalId: 'sample-checking',
            field: 'balance',
            memoValue: 16000,
            trackerValue: 14842,
            delta: -1158,
            threshold: 100,
            bucket: 'checking',
            status: 'drifted',
          },
          {
            externalId: 'sample-tsp',
            field: 'balance',
            memoValue: 500000,
            trackerValue: 525000,
            delta: 25000,
            threshold: 0,
            bucket: 'investment',
            status: 'drifted',
          },
        ],
      }),
      { now: FIXED_NOW },
    );
    expect(md).toMatch(/\| Account \| Memo/);
    expect(md).toMatch(/Sample Checking/);
    expect(md).toMatch(/Sample TSP/);
    expect(md).toMatch(/\+\$25,000/);
    expect(md).toMatch(/-\$1,158/);
  });

  it('sorts drift entries by absolute magnitude descending', () => {
    const md = buildDriftReport(
      makeRecon({
        drift: [
          {
            externalId: 'sample-checking',
            delta: -100,
            memoValue: 0,
            trackerValue: -100,
            threshold: 50,
            bucket: 'x',
          },
          {
            externalId: 'sample-tsp',
            delta: 50000,
            memoValue: 0,
            trackerValue: 50000,
            threshold: 0,
            bucket: 'x',
          },
        ],
      }),
      { now: FIXED_NOW },
    );
    const tspIdx = md.indexOf('Sample TSP');
    const chkIdx = md.indexOf('Sample Checking');
    expect(tspIdx).toBeGreaterThan(-1);
    expect(chkIdx).toBeGreaterThan(-1);
    expect(tspIdx).toBeLessThan(chkIdx);
  });

  it('lists unmatched memo and tracker accounts when present', () => {
    const md = buildDriftReport(
      makeRecon({
        unmatchedMemo: ['VIP Vanguard'],
        unmatchedActual: ['Mystery Brokerage'],
      }),
      { now: FIXED_NOW },
    );
    expect(md).toMatch(/In memo, not seen in tracker/);
    expect(md).toMatch(/VIP Vanguard/);
    expect(md).toMatch(/In tracker, not in memo/);
    expect(md).toMatch(/Mystery Brokerage/);
  });

  it('renders sanity checks with stale account ages', () => {
    const md = buildDriftReport(
      makeRecon({
        sanityChecks: {
          unmarkedTransfers: 2,
          uncategorized: 3,
          staleAccounts: [{ name: 'TSP', lastReconciledAt: '2026-05-01', ageDays: 27 }],
        },
      }),
      { now: FIXED_NOW },
    );
    expect(md).toMatch(/Unmarked transfers: \*\*2\*\*/);
    expect(md).toMatch(/Uncategorized transactions: \*\*3\*\*/);
    expect(md).toMatch(/TSP: last reconciled 2026-05-01 \(27d ago\)/);
  });

  it('notes when Actual was not consulted', () => {
    const md = buildDriftReport(makeRecon({ sanityChecks: null }), { now: FIXED_NOW });
    expect(md).toMatch(/Actual not consulted this run/);
  });

  it('reports skipped accounts when emit returned any', () => {
    const md = buildDriftReport(makeRecon(), {
      now: FIXED_NOW,
      skipped: [
        {
          externalId: 'capital-one-miles',
          displayName: 'Capital One Miles',
          reason: 'no finite balance',
        },
      ],
    });
    expect(md).toMatch(/## Skipped accounts/);
    expect(md).toMatch(/Capital One Miles/);
    expect(md).toMatch(/no finite balance/);
  });

  it('includes memo SHA in the header when present', () => {
    const recon = makeRecon();
    recon._sources = {
      memo: '4c9fcd7032ec5fce06c79d5f6f84e2567e5d6f4426441760b5562329018a41eb',
      actual: null,
    };
    const md = buildDriftReport(recon, { now: FIXED_NOW });
    expect(md).toMatch(/Memo SHA: `4c9fcd7032ec5fce/);
  });

  it('throws on missing reconciled view', () => {
    expect(() => buildDriftReport(null)).toThrow(/reconciled output/);
    expect(() => buildDriftReport({})).toThrow(/reconciled output/);
  });

  it('ends with a trailing newline', () => {
    const md = buildDriftReport(makeRecon(), { now: FIXED_NOW });
    expect(md.endsWith('\n')).toBe(true);
  });
});
