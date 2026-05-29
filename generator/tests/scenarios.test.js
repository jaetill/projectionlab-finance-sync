import { describe, it, expect } from 'vitest';

import {
  KNOWN_LEVERS,
  findScenariosSection,
  parseLeverLine,
  parseLifestyleTarget,
  parseOneTimeEvent,
  parseStateTaxRate,
  parseScenarios,
  composeScenario,
  composeScenarioPlans,
} from '../src/scenarios.js';

// ---------------------------------------------------------------------------
// Section + lever parsing
// ---------------------------------------------------------------------------

describe('findScenariosSection', () => {
  it('extracts the Scenarios section verbatim', () => {
    const md = [
      '## Other',
      '',
      '## Scenarios',
      '',
      '### base',
      '',
      '### move-to-tn',
      '- effective: 2027-01-01',
      '',
      '## Next Section',
      '',
    ].join('\n');
    const section = findScenariosSection(md);
    expect(section).toContain('### base');
    expect(section).toContain('### move-to-tn');
    expect(section).not.toContain('Next Section');
  });

  it('returns null when no Scenarios section present', () => {
    expect(findScenariosSection('## Assets\nfoo')).toBeNull();
  });
});

describe('parseLeverLine', () => {
  it('parses simple key: value pairs', () => {
    expect(parseLeverLine('- effective: 2027-01-01')).toEqual({
      name: 'effective',
      raw: '2027-01-01',
    });
  });

  it('handles dotted lever names', () => {
    expect(parseLeverLine('- retirement-date.jason: 2030-05-01')).toEqual({
      name: 'retirement-date.jason',
      raw: '2030-05-01',
    });
  });

  it('lowercases the lever name', () => {
    expect(parseLeverLine('- Effective: 2027-01-01').name).toBe('effective');
  });

  it('returns null on non-lever lines', () => {
    expect(parseLeverLine('not a lever')).toBeNull();
    expect(parseLeverLine('### scenario heading')).toBeNull();
    expect(parseLeverLine('')).toBeNull();
  });
});

describe('parseLifestyleTarget', () => {
  it('parses monthly $ amount', () => {
    expect(parseLifestyleTarget('$12,000/mo')).toEqual({
      mode: 'absolute',
      amount: 12000,
      unit: 'monthly',
    });
  });

  it('parses yearly $ amount', () => {
    expect(parseLifestyleTarget('$144,000/yr')).toEqual({
      mode: 'absolute',
      amount: 144000,
      unit: 'yearly',
    });
  });

  it('defaults to monthly when no unit', () => {
    expect(parseLifestyleTarget('$9,700').unit).toBe('monthly');
  });

  it('throws on malformed input', () => {
    expect(() => parseLifestyleTarget('twelve thousand')).toThrow(/invalid/);
  });
});

describe('parseOneTimeEvent', () => {
  it('parses an inflow to a named account', () => {
    expect(parseOneTimeEvent('+$1,000,000 to vanguard-brokerage on 2030-01-01')).toEqual({
      direction: 'in',
      amount: 1000000,
      account: 'vanguard-brokerage',
      date: '2030-01-01',
    });
  });

  it('parses an outflow', () => {
    expect(parseOneTimeEvent('-$50,000 from ally-savings on 2027-08-01')).toEqual({
      direction: 'out',
      amount: 50000,
      account: 'ally-savings',
      date: '2027-08-01',
    });
  });

  it('throws on malformed input', () => {
    expect(() => parseOneTimeEvent('one million dollars')).toThrow(/invalid/);
  });
});

describe('parseScenarios', () => {
  const sample = [
    '## Scenarios',
    '',
    '### base',
    'The current path.',
    '',
    '### inherit-1m',
    '- effective: 2030-01-01',
    '- one-time-event: +$1,000,000 to vanguard-brokerage on 2030-01-01',
    '',
    '### lifestyle-12k',
    '- effective: 2026-08-01',
    '- lifestyle-target: $12,000/mo',
    '- retirement-date.jason: 2026-07-31',
    '',
  ].join('\n');

  it('returns [] when no Scenarios section', () => {
    expect(parseScenarios('## Assets\n')).toEqual([]);
  });

  it('parses scenario headings into entries', () => {
    const scenarios = parseScenarios(sample);
    expect(scenarios.map((s) => s.name)).toEqual(['base', 'inherit-1m', 'lifestyle-12k']);
  });

  it('slugifies names', () => {
    const scenarios = parseScenarios(sample);
    expect(scenarios.find((s) => s.name === 'inherit-1m').slug).toBe('inherit-1m');
  });

  it('captures effective date', () => {
    const scenarios = parseScenarios(sample);
    expect(scenarios.find((s) => s.name === 'inherit-1m').effective).toBe('2030-01-01');
  });

  it('captures one-time-event overrides', () => {
    const scenarios = parseScenarios(sample);
    const events = scenarios.find((s) => s.name === 'inherit-1m').overrides['one-time-event'];
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(1000000);
  });

  it('captures retirement-date.<person> overrides', () => {
    const scenarios = parseScenarios(sample);
    const ret = scenarios.find((s) => s.name === 'lifestyle-12k').overrides['retirement-date'];
    expect(ret.jason).toBe('2026-07-31');
  });

  it('throws on unknown levers (typo guard)', () => {
    const bad = '## Scenarios\n\n### x\n- unknown-lever: 1\n';
    expect(() => parseScenarios(bad)).toThrow(/unknown lever/);
  });

  it('throws on malformed dates', () => {
    const bad = '## Scenarios\n\n### x\n- effective: tomorrow\n';
    expect(() => parseScenarios(bad)).toThrow(/YYYY-MM-DD/);
  });

  it('KNOWN_LEVERS exposes the v1 set + PR-K2 state-tax-rate', () => {
    expect(KNOWN_LEVERS.has('lifestyle-target')).toBe(true);
    expect(KNOWN_LEVERS.has('retirement-date.jason')).toBe(true);
    expect(KNOWN_LEVERS.has('one-time-event')).toBe(true);
    expect(KNOWN_LEVERS.has('state-tax-rate')).toBe(true);
    expect(KNOWN_LEVERS.has('housing-event')).toBe(false); // deferred
  });
});

describe('parseStateTaxRate', () => {
  it('parses percent with trailing %', () => {
    expect(parseStateTaxRate('5.75%')).toBe(5.75);
  });

  it('parses bare number (no %)', () => {
    expect(parseStateTaxRate('5.75')).toBe(5.75);
  });

  it('parses zero', () => {
    expect(parseStateTaxRate('0%')).toBe(0);
    expect(parseStateTaxRate('0')).toBe(0);
  });

  it('parses integer rate', () => {
    expect(parseStateTaxRate('7%')).toBe(7);
  });

  it('throws on malformed input', () => {
    expect(() => parseStateTaxRate('five percent')).toThrow(/invalid/);
    expect(() => parseStateTaxRate('5.75% ish')).toThrow(/invalid/);
    expect(() => parseStateTaxRate('')).toThrow(/invalid/);
  });
});

describe('parseScenarios — state-tax-rate', () => {
  it('captures state-tax-rate override', () => {
    const md = [
      '## Scenarios',
      '',
      '### move-to-tn',
      '- effective: 2027-01-01',
      '- state-tax-rate: 0%',
      '',
    ].join('\n');
    const scenarios = parseScenarios(md);
    expect(scenarios[0].overrides['state-tax-rate']).toBe(0);
  });

  it('defaults state-tax-rate to null when not set', () => {
    const md = ['## Scenarios', '', '### base', 'no overrides', ''].join('\n');
    expect(parseScenarios(md)[0].overrides['state-tax-rate']).toBeNull();
  });
});

describe('composeScenario — state-tax-rate', () => {
  function baseT() {
    return {
      id: 'plan-base',
      name: 'Base',
      active: true,
      milestones: [],
      income: { events: [] },
      expenses: { events: [] },
      accounts: { events: [] },
      assets: { events: [] },
      variables: { localIncomeTaxRate: 5.75 },
    };
  }

  it('writes plan.variables.localIncomeTaxRate when set', () => {
    const out = composeScenario(baseT(), {
      name: 'tn',
      slug: 'tn',
      overrides: {
        'retirement-date': {},
        'one-time-event': [],
        'state-tax-rate': 0,
      },
    });
    expect(out.variables.localIncomeTaxRate).toBe(0);
  });

  it('leaves variables.localIncomeTaxRate alone when override is null', () => {
    const out = composeScenario(baseT(), {
      name: 'b',
      slug: 'b',
      overrides: {
        'retirement-date': {},
        'one-time-event': [],
        'state-tax-rate': null,
      },
    });
    expect(out.variables.localIncomeTaxRate).toBe(5.75);
  });

  it('creates variables object when base plan lacks one', () => {
    const bareBase = baseT();
    delete bareBase.variables;
    const out = composeScenario(bareBase, {
      name: 't',
      slug: 't',
      overrides: {
        'retirement-date': {},
        'one-time-event': [],
        'state-tax-rate': 4,
      },
    });
    expect(out.variables.localIncomeTaxRate).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

function baseTemplate() {
  return {
    id: 'plan-base',
    name: 'Base',
    active: true,
    milestones: [
      {
        id: 'milestone-your-retirement',
        name: "Jason's Retirement",
        criteria: [{ type: 'year', value: '2026-07-31' }],
      },
      {
        id: 'milestone-spouse-retirement',
        name: "Heidi's Retirement",
        criteria: [{ type: 'year', value: '2040-06-01' }],
      },
    ],
    income: { events: [{ id: 'income-salary', name: 'Salary', amount: 100000 }] },
    expenses: { events: [{ id: 'expense-lifestyle', name: 'Lifestyle', amount: 60000 }] },
    accounts: { events: [] },
    assets: { events: [] },
  };
}

describe('composeScenario', () => {
  const base = baseTemplate();

  it('re-ids the plan + sub-entities with scenario slug', () => {
    const out = composeScenario(base, {
      name: 'Both retire at 55',
      slug: 'both-retire-55',
      effective: null,
      overrides: { 'lifestyle-target': null, 'retirement-date': {}, 'one-time-event': [] },
    });
    expect(out.id).toBe('plan-both-retire-55');
    expect(out.milestones[0].id).toBe('milestone-your-retirement-both-retire-55');
    expect(out.income.events[0].id).toBe('income-salary-both-retire-55');
    expect(out.expenses.events[0].id).toBe('expense-lifestyle-both-retire-55');
  });

  it('applies retirement-date.jason to the right milestone', () => {
    const out = composeScenario(base, {
      name: 'Retire 55',
      slug: 'r55',
      overrides: { 'retirement-date': { jason: '2030-05-01' }, 'one-time-event': [] },
    });
    const m = out.milestones.find((x) => /Jason/.test(x.name));
    expect(m.criteria[0].value).toBe('2030-05-01');
  });

  it('applies retirement-date.heidi to the spouse milestone', () => {
    const out = composeScenario(base, {
      name: 'r',
      slug: 'r',
      overrides: { 'retirement-date': { heidi: '2030-06-01' }, 'one-time-event': [] },
    });
    const m = out.milestones.find((x) => /Heidi/.test(x.name));
    expect(m.criteria[0].value).toBe('2030-06-01');
  });

  it('replaces the Lifestyle expense amount with a monthly target converted to yearly', () => {
    const out = composeScenario(base, {
      name: 'lifestyle12k',
      slug: 'lifestyle12k',
      overrides: {
        'lifestyle-target': { mode: 'absolute', amount: 12000, unit: 'monthly' },
        'retirement-date': {},
        'one-time-event': [],
      },
    });
    const exp = out.expenses.events.find((e) => /Lifestyle/i.test(e.name));
    expect(exp.amount).toBe(144000); // $12k/mo * 12
    expect(exp.frequency).toBe('yearly');
  });

  it('honors yearly-unit lifestyle targets directly', () => {
    const out = composeScenario(base, {
      name: 'l',
      slug: 'l',
      overrides: {
        'lifestyle-target': { mode: 'absolute', amount: 100000, unit: 'yearly' },
        'retirement-date': {},
        'one-time-event': [],
      },
    });
    const exp = out.expenses.events.find((e) => /Lifestyle/i.test(e.name));
    expect(exp.amount).toBe(100000);
  });

  it('creates a Lifestyle expense when the base plan lacks one', () => {
    const bareBase = baseTemplate();
    bareBase.expenses.events = [];
    const out = composeScenario(bareBase, {
      name: 'l',
      slug: 'l',
      overrides: {
        'lifestyle-target': { mode: 'absolute', amount: 9700, unit: 'monthly' },
        'retirement-date': {},
        'one-time-event': [],
      },
    });
    const exp = out.expenses.events.find((e) => /Lifestyle/i.test(e.name));
    expect(exp).toBeDefined();
    expect(exp.amount).toBe(116400);
  });

  it('emits one-time-event entries as account events', () => {
    const out = composeScenario(base, {
      name: 'inherit1m',
      slug: 'inherit1m',
      overrides: {
        'retirement-date': {},
        'one-time-event': [
          { direction: 'in', amount: 1000000, account: 'vanguard-brokerage', date: '2030-01-01' },
        ],
      },
    });
    expect(out.accounts.events).toHaveLength(1);
    const ev = out.accounts.events[0];
    expect(ev.amount).toBe(1000000);
    expect(ev.accountId).toBe('acct-vanguard-brokerage');
    expect(ev.start.value).toBe('2030-01-01');
  });

  it('flips sign for an outflow one-time-event', () => {
    const out = composeScenario(base, {
      name: 'x',
      slug: 'x',
      overrides: {
        'retirement-date': {},
        'one-time-event': [
          { direction: 'out', amount: 50000, account: 'ally-savings', date: '2027-08-01' },
        ],
      },
    });
    expect(out.accounts.events[0].amount).toBe(-50000);
  });
});

describe('composeScenarioPlans', () => {
  const base = baseTemplate();

  it('returns null when no scenarios provided (signal to caller to use base.plans verbatim)', () => {
    expect(composeScenarioPlans(base, [])).toBeNull();
    expect(composeScenarioPlans(base, null)).toBeNull();
  });

  it('composes one PL plan per scenario', () => {
    const plans = composeScenarioPlans(base, [
      { name: 'base', slug: 'base', overrides: { 'retirement-date': {}, 'one-time-event': [] } },
      {
        name: 'Retire 55',
        slug: 'retire-55',
        overrides: { 'retirement-date': { jason: '2030-05-01' }, 'one-time-event': [] },
      },
    ]);
    expect(plans).toHaveLength(2);
    expect(plans[0].name).toBe('base');
    expect(plans[1].name).toBe('Retire 55');
  });

  it('marks exactly one plan active', () => {
    const plans = composeScenarioPlans(base, [
      { name: 'foo', slug: 'foo', overrides: { 'retirement-date': {}, 'one-time-event': [] } },
      { name: 'bar', slug: 'bar', overrides: { 'retirement-date': {}, 'one-time-event': [] } },
    ]);
    expect(plans.filter((p) => p.active)).toHaveLength(1);
  });

  it('throws when scenarios are present but no base plan', () => {
    expect(() =>
      composeScenarioPlans(null, [
        { name: 'x', slug: 'x', overrides: { 'retirement-date': {}, 'one-time-event': [] } },
      ]),
    ).toThrow(/basePlan/);
  });
});
