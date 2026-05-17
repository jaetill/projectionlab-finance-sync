import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validatePlan } from '../../userscript/src/plan-validator.js';

const here = dirname(fileURLToPath(import.meta.url));
const examplePath = resolve(here, '../../data/plan.example.json');
const example = JSON.parse(readFileSync(examplePath, 'utf8'));

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('validatePlan', () => {
  it('accepts data/plan.example.json', () => {
    const result = validatePlan(example);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects non-object input', () => {
    expect(validatePlan(null).valid).toBe(false);
    expect(validatePlan('nope').valid).toBe(false);
    expect(validatePlan(42).valid).toBe(false);
  });

  it('rejects wrong schemaVersion', () => {
    const plan = clone(example);
    plan.schemaVersion = 99;
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('schemaVersion'))).toBe(true);
  });

  it('rejects missing accounts array', () => {
    const plan = clone(example);
    plan.accounts = [];
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('accounts'))).toBe(true);
  });

  it('rejects an account with an unknown type', () => {
    const plan = clone(example);
    plan.accounts[0].type = 'NEVER_HEARD_OF_IT';
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('accounts[0].type'))).toBe(true);
  });

  it('rejects a non-finite balance', () => {
    const plan = clone(example);
    plan.accounts[0].balance = 'a million';
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('balance'))).toBe(true);
  });

  it('rejects bad date format on a milestone', () => {
    const plan = clone(example);
    plan.milestones[0].date = '05/01/2030';
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('milestones[0].date'))).toBe(true);
  });

  it('accepts a plan with no income/expenses/milestones', () => {
    const minimal = {
      schemaVersion: 1,
      generatedAt: '2026-05-11T00:00:00Z',
      asOfDate: '2026-05-11',
      accounts: [{ name: 'Acct', type: 'CHECKING', balance: 100, currency: 'USD', owner: 'self' }],
    };
    const result = validatePlan(minimal);
    expect(result.valid).toBe(true);
  });

  it('rejects bad frequency on income', () => {
    const plan = clone(example);
    plan.income[0].frequency = 'BIWEEKLY';
    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('frequency'))).toBe(true);
  });
});
