import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  KNOWN_ACCOUNT_TYPES,
  KNOWN_MILESTONE_CRITERIA_TYPES,
  validatePlan,
} from '../../userscript/src/plan-validator.js';
import { makeValidPlan } from '../setup.js';

describe('validatePlan', () => {
  it('accepts a minimal valid plan', () => {
    const result = validatePlan(makeValidPlan());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects non-object input', () => {
    expect(validatePlan(null).valid).toBe(false);
    expect(validatePlan('foo').valid).toBe(false);
    expect(validatePlan(42).valid).toBe(false);
  });

  it('requires top-level today and plans', () => {
    const r = validatePlan({});
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('today'))).toBe(true);
    expect(r.errors.some((e) => e.includes('plans'))).toBe(true);
  });

  it('rejects today.savingsAccounts that is not an array', () => {
    const r = validatePlan({
      today: { savingsAccounts: 'oops', investmentAccounts: [], debts: [], assets: [] },
      plans: [{ id: 'p', name: 'P' }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('savingsAccounts'))).toBe(true);
  });

  it('rejects empty plans array', () => {
    const r = validatePlan({
      today: { savingsAccounts: [], investmentAccounts: [], debts: [], assets: [] },
      plans: [],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('plans'))).toBe(true);
  });

  it('rejects an account missing id', () => {
    const plan = makeValidPlan();
    delete plan.today.savingsAccounts[0].id;
    const r = validatePlan(plan);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('savingsAccounts[0].id'))).toBe(true);
  });

  it('rejects an account with non-numeric balance', () => {
    const plan = makeValidPlan();
    plan.today.investmentAccounts[0].balance = 'oops';
    const r = validatePlan(plan);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('balance'))).toBe(true);
  });

  it('warns on unknown account type but does not fail validation', () => {
    const plan = makeValidPlan();
    plan.today.investmentAccounts[0].type = 'made-up-type';
    const r = validatePlan(plan);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.includes('made-up-type'))).toBe(true);
  });

  it('rejects a plan missing id or name', () => {
    const plan = makeValidPlan({ plans: [{ id: 'p1' }] });
    const r = validatePlan(plan);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('plans[0].name'))).toBe(true);
  });

  it('rejects a milestone missing id', () => {
    const plan = makeValidPlan();
    plan.plans[0].milestones[0].id = '';
    const r = validatePlan(plan);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('milestones[0].id'))).toBe(true);
  });

  it('warns on unknown milestone criterion type', () => {
    const plan = makeValidPlan();
    plan.plans[0].milestones[0].criteria = [{ type: 'foo' }];
    const r = validatePlan(plan);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.includes("type='foo'"))).toBe(true);
  });

  it('rejects income.events that is not an array', () => {
    const plan = makeValidPlan();
    plan.plans[0].income = { events: 'oops' };
    const r = validatePlan(plan);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('income.events'))).toBe(true);
  });

  it('treats missing income/expenses as allowed', () => {
    const plan = makeValidPlan();
    delete plan.plans[0].income;
    delete plan.plans[0].expenses;
    const r = validatePlan(plan);
    expect(r.valid).toBe(true);
  });

  it('exports the schema version constant', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
  });

  it('exposes known account and criterion type sets', () => {
    expect(KNOWN_ACCOUNT_TYPES.has('ira')).toBe(true);
    expect(KNOWN_ACCOUNT_TYPES.has('roth-ira')).toBe(true);
    expect(KNOWN_MILESTONE_CRITERIA_TYPES.has('year')).toBe(true);
  });

  it('validates the canonical plan.example.json shape', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const examplePath = resolve(process.cwd(), 'data/plan.example.json');
    const example = JSON.parse(readFileSync(examplePath, 'utf8'));
    const r = validatePlan(example);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });
});
