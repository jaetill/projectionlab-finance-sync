import { describe, it, expect } from 'vitest';

import { TOOLS, composeOverrides, resolveMemoPath } from '../src/tools.js';

// Tiny fake impl for handler tests
function makeFakeImpl(overrides = {}) {
  return {
    runPipeline: async (opts) => ({
      memo: { sourceSha: 'fake-sha' },
      actual: null,
      reconciled: {
        accounts: [{ externalId: 'a' }, { externalId: 'b' }],
        drift: [],
        scenarios: opts.ephemeralScenarios || [],
      },
      emit: opts.dryRun ? null : { written: true, path: '/tmp/plan.json', skipped: [] },
      driftMarkdown: '# fake drift',
      ...overrides.runPipeline,
    }),
    check: async () => ({
      memo: { ok: true, accountsCount: 14, incomeStreams: 4, scenarios: 5 },
      actual: { configured: false },
      ...overrides.check,
    }),
    actualSnapshot: async () => ({
      accounts: [
        { actualId: 'a1', name: 'Sample Checking', balance: 15000 },
        { actualId: 'a2', name: 'Sample Savings', balance: 50000 },
      ],
      ...overrides.actualSnapshot,
    }),
  };
}

describe('resolveMemoPath', () => {
  it('uses args.memoPath when provided', () => {
    expect(resolveMemoPath({ memoPath: '/a/b.md' }, {})).toBe('/a/b.md');
  });

  it('falls back to env.MEMO_PATH', () => {
    expect(resolveMemoPath({}, { MEMO_PATH: '/c.md' })).toBe('/c.md');
  });

  it('args win over env', () => {
    expect(resolveMemoPath({ memoPath: '/from-args.md' }, { MEMO_PATH: '/from-env.md' })).toBe(
      '/from-args.md',
    );
  });

  it('throws when neither set', () => {
    expect(() => resolveMemoPath({}, {})).toThrow(/memoPath required/);
  });
});

describe('composeOverrides', () => {
  it('returns [] for null/empty input', () => {
    expect(composeOverrides(null)).toEqual([]);
    expect(composeOverrides([])).toEqual([]);
  });

  it('slugifies the scenario name', () => {
    expect(composeOverrides([{ name: 'What If 53' }])[0].slug).toBe('what-if-53');
  });

  it('fills missing override sections with safe defaults', () => {
    const out = composeOverrides([{ name: 'x' }]);
    expect(out[0].overrides).toEqual({
      'lifestyle-target': null,
      'retirement-date': {},
      'one-time-event': [],
    });
  });

  it('passes through all lever sections when present', () => {
    const out = composeOverrides([
      {
        name: 'rich-and-retired',
        effective: '2030-01-01',
        overrides: {
          'lifestyle-target': { mode: 'absolute', amount: 11000, unit: 'monthly' },
          'retirement-date': { jason: '2028-04-01' },
          'one-time-event': [
            { direction: 'in', amount: 500000, account: 'vg', date: '2030-01-01' },
          ],
        },
      },
    ]);
    expect(out[0].effective).toBe('2030-01-01');
    expect(out[0].overrides['lifestyle-target'].amount).toBe(11000);
    expect(out[0].overrides['retirement-date'].jason).toBe('2028-04-01');
    expect(out[0].overrides['one-time-event']).toHaveLength(1);
  });
});

describe('TOOLS', () => {
  it('exposes 4 tools with required fields', () => {
    expect(TOOLS).toHaveLength(4);
    for (const t of TOOLS) {
      expect(t.name).toBeTypeOf('string');
      expect(t.description).toBeTypeOf('string');
      expect(t.inputSchema).toBeDefined();
      expect(t.handler).toBeTypeOf('function');
    }
  });

  it('all tool names are kebab/snake-cased and unique', () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) {
      expect(n).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe('generate_plan handler', () => {
  const tool = TOOLS.find((t) => t.name === 'generate_plan');

  it('runs pipeline against the memo path supplied in args', async () => {
    const impl = makeFakeImpl();
    const out = await tool.handler({ memoPath: '/m.md' }, { env: {}, impl });
    const body = JSON.parse(out.content[0].text);
    expect(body.summary.accountsCount).toBe(2);
    expect(body.summary.written).toBe(true);
  });

  it('forces dry-run when scenario_overrides supplied', async () => {
    let receivedOpts = null;
    const impl = makeFakeImpl();
    const wrapped = {
      ...impl,
      runPipeline: async (opts) => {
        receivedOpts = opts;
        return impl.runPipeline(opts);
      },
    };
    await tool.handler(
      { memoPath: '/m.md', scenarioOverrides: [{ name: 'whatif' }] },
      { env: {}, impl: wrapped },
    );
    expect(receivedOpts.dryRun).toBe(true);
    expect(receivedOpts.ephemeralScenarios).toHaveLength(1);
  });

  it('throws when no memo path available', async () => {
    const impl = makeFakeImpl();
    await expect(tool.handler({}, { env: {}, impl })).rejects.toThrow(/memoPath required/);
  });
});

describe('get_drift handler', () => {
  const tool = TOOLS.find((t) => t.name === 'get_drift');

  it('returns the drift markdown', async () => {
    const impl = makeFakeImpl();
    const out = await tool.handler({ memoPath: '/m.md' }, { env: {}, impl });
    expect(out.content[0].text).toBe('# fake drift');
  });

  it('does not run emit (includeEmit:false)', async () => {
    let receivedOpts = null;
    const impl = makeFakeImpl();
    const wrapped = {
      ...impl,
      runPipeline: async (opts) => {
        receivedOpts = opts;
        return impl.runPipeline(opts);
      },
    };
    await tool.handler({ memoPath: '/m.md' }, { env: {}, impl: wrapped });
    expect(receivedOpts.includeEmit).toBe(false);
  });
});

describe('check handler', () => {
  const tool = TOOLS.find((t) => t.name === 'check');

  it('returns memo + actual status', async () => {
    const impl = makeFakeImpl();
    const out = await tool.handler({ memoPath: '/m.md' }, { env: {}, impl });
    const body = JSON.parse(out.content[0].text);
    expect(body.memo.ok).toBe(true);
    expect(body.memo.accountsCount).toBe(14);
  });
});

describe('query_account handler', () => {
  const tool = TOOLS.find((t) => t.name === 'query_account');

  it('case-insensitive substring matches the account name', async () => {
    const impl = makeFakeImpl();
    const out = await tool.handler({ name: 'checking' }, { env: {}, impl });
    const body = JSON.parse(out.content[0].text);
    expect(body.matchCount).toBe(1);
    expect(body.accounts[0].name).toBe('Sample Checking');
  });

  it('returns empty matches when no account found', async () => {
    const impl = makeFakeImpl();
    const out = await tool.handler({ name: 'mystery' }, { env: {}, impl });
    const body = JSON.parse(out.content[0].text);
    expect(body.matchCount).toBe(0);
  });
});
