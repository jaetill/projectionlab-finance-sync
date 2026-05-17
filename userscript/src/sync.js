// Core sync logic. Idempotent: reads existing PL state, diffs against plan.json,
// pushes only what differs. Returns a SyncResult that the UI renders.

import { resolvePlanAccounts } from './account-mapping.js';
import { validatePlan } from './plan-validator.js';

export function emptyResult() {
  return {
    ok: true,
    counts: { accounts: 0, milestones: 0, income: 0, expenses: 0 },
    errors: [],
    unresolved: [],
    skipped: { accounts: 0, milestones: 0, income: 0, expenses: 0 },
    startedAt: null,
    finishedAt: null,
  };
}

function recordError(result, scope, error) {
  result.ok = false;
  result.errors.push({ scope, message: error?.message ?? String(error) });
}

function accountsEqual(planAccount, plAccount) {
  if (!plAccount) return false;
  return (
    plAccount.name === planAccount.name &&
    plAccount.type === planAccount.type &&
    plAccount.balance === planAccount.balance &&
    plAccount.currency === planAccount.currency
  );
}

function findByLabel(list, label) {
  return Array.isArray(list) ? list.find((item) => item?.label === label) : undefined;
}

async function syncAccounts(plan, pl, accountMap, result) {
  let existing = [];
  try {
    existing = await pl.getAccounts();
  } catch (err) {
    recordError(result, 'getAccounts', err);
    return;
  }
  const { resolved, unresolved } = resolvePlanAccounts(plan, accountMap, existing);
  result.unresolved.push(...unresolved.map((a) => ({ kind: 'account', name: a.name })));

  for (const { planAccount, id } of resolved) {
    const current = existing.find((a) => a.id === id);
    if (accountsEqual(planAccount, current)) {
      result.skipped.accounts += 1;
      continue;
    }
    try {
      await pl.setAccount({ id, ...planAccount });
      result.counts.accounts += 1;
    } catch (err) {
      recordError(result, `setAccount(${planAccount.name})`, err);
    }
  }
}

async function syncLabeled(planList, plListMethod, plSetMethod, scope, pl, result, comparator) {
  if (!Array.isArray(planList) || planList.length === 0) return;
  let existing = [];
  try {
    existing = await plListMethod();
  } catch (err) {
    recordError(result, `${scope}.list`, err);
    return;
  }
  for (const item of planList) {
    const current = findByLabel(existing, item.label);
    if (current && comparator(item, current)) {
      result.skipped[scope] += 1;
      continue;
    }
    try {
      await plSetMethod(current?.id ? { id: current.id, ...item } : { ...item });
      result.counts[scope] += 1;
    } catch (err) {
      recordError(result, `${scope}.set(${item.label})`, err);
    }
  }
}

const incomeEqual = (a, b) =>
  a.amount === b.amount && a.frequency === b.frequency && a.startDate === b.startDate;
const expenseEqual = (a, b) =>
  a.amount === b.amount && a.frequency === b.frequency && a.category === b.category;
const milestoneEqual = (a, b) => a.date === b.date && a.kind === b.kind;

export async function syncPlan(plan, pl, accountMap = {}, now = () => new Date().toISOString()) {
  const result = emptyResult();
  result.startedAt = now();

  const validation = validatePlan(plan);
  if (!validation.valid) {
    result.ok = false;
    result.errors.push({ scope: 'validation', message: validation.errors.join('; ') });
    result.finishedAt = now();
    return result;
  }

  await syncAccounts(plan, pl, accountMap, result);
  await syncLabeled(
    plan.income,
    () => pl.getIncomes(),
    (x) => pl.setIncome(x),
    'income',
    pl,
    result,
    incomeEqual,
  );
  await syncLabeled(
    plan.expenses,
    () => pl.getExpenses(),
    (x) => pl.setExpense(x),
    'expenses',
    pl,
    result,
    expenseEqual,
  );
  await syncLabeled(
    plan.milestones,
    () => pl.getMilestones(),
    (x) => pl.setMilestone(x),
    'milestones',
    pl,
    result,
    milestoneEqual,
  );

  result.finishedAt = now();
  return result;
}
