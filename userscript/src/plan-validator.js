// Structural validator for plan.json. Returns { valid, errors } — never throws.
//
// Contract: plan.json mirrors the shape that ProjectionLab's exportData() returns
// (minus user-owned `progress`/`settings`/`meta`), i.e. roughly:
//
//   {
//     _meta?: { ... our metadata, ignored by PL ... },
//     today: { savingsAccounts, investmentAccounts, debts, assets, ... },
//     plans: [ { id, name, milestones, income:{events}, expenses:{events}, accounts:{events}, ... } ]
//   }
//
// The userscript hands `today` to pl.restoreCurrentFinances() and `plans` to
// pl.restorePlans() wholesale. PL does its own field-level validation; we only
// catch structural errors here so the user sees them BEFORE we push to PL.

export const CURRENT_SCHEMA_VERSION = 2;

// Investment / savings account types observed in PL exports. Lenient — we
// surface unknown types as warnings, not errors, so PL ultimately decides.
export const KNOWN_ACCOUNT_TYPES = new Set([
  'ira',
  'roth-ira',
  'taxable',
  'savings',
  'checking',
  '401k',
  'roth-401k',
  '403b',
  'hsa',
  'sep-ira',
  'simple-ira',
  'crypto',
  'cd',
  'money-market',
  'brokerage',
]);

export const KNOWN_MILESTONE_CRITERIA_TYPES = new Set([
  'year',
  'age',
  'spending',
  'net_worth',
  'savings',
  'income',
  'asset',
]);

function pushIf(errors, condition, message) {
  if (!condition) errors.push(message);
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function validateAccountList(list, listName, errors, warnings) {
  if (!Array.isArray(list)) {
    errors.push(`today.${listName} must be an array`);
    return;
  }
  list.forEach((acct, i) => {
    const prefix = `today.${listName}[${i}]`;
    pushIf(errors, isObject(acct), `${prefix} must be an object`);
    if (!isObject(acct)) return;
    pushIf(errors, isNonEmptyString(acct.id), `${prefix}.id must be a non-empty string`);
    pushIf(errors, isNonEmptyString(acct.name), `${prefix}.name must be a non-empty string`);
    pushIf(errors, isNonEmptyString(acct.type), `${prefix}.type must be a non-empty string`);
    pushIf(
      errors,
      typeof acct.balance === 'number' && Number.isFinite(acct.balance),
      `${prefix}.balance must be a finite number`,
    );
    if (isNonEmptyString(acct.type) && !KNOWN_ACCOUNT_TYPES.has(acct.type)) {
      warnings.push(
        `${prefix}.type='${acct.type}' is not in KNOWN_ACCOUNT_TYPES — PL may reject it`,
      );
    }
  });
}

function validateMilestone(m, planIdx, milestoneIdx, errors, warnings) {
  const prefix = `plans[${planIdx}].milestones[${milestoneIdx}]`;
  pushIf(errors, isObject(m), `${prefix} must be an object`);
  if (!isObject(m)) return;
  pushIf(errors, isNonEmptyString(m.id), `${prefix}.id must be a non-empty string`);
  pushIf(errors, isNonEmptyString(m.name), `${prefix}.name must be a non-empty string`);
  if (m.criteria !== undefined) {
    pushIf(errors, Array.isArray(m.criteria), `${prefix}.criteria must be an array`);
    if (Array.isArray(m.criteria)) {
      m.criteria.forEach((c, ci) => {
        const cp = `${prefix}.criteria[${ci}]`;
        pushIf(errors, isObject(c), `${cp} must be an object`);
        if (!isObject(c)) return;
        pushIf(errors, isNonEmptyString(c.type), `${cp}.type must be a non-empty string`);
        if (isNonEmptyString(c.type) && !KNOWN_MILESTONE_CRITERIA_TYPES.has(c.type)) {
          warnings.push(`${cp}.type='${c.type}' is not in KNOWN_MILESTONE_CRITERIA_TYPES`);
        }
      });
    }
  }
}

function validateEventBag(bag, label, planIdx, errors) {
  // PL groups income/expenses/accounts/assets as { events: [...] } inside a plan.
  if (bag === undefined) return; // Optional — empty plan is allowed.
  const prefix = `plans[${planIdx}].${label}`;
  pushIf(errors, isObject(bag), `${prefix} must be an object with an events array`);
  if (!isObject(bag)) return;
  pushIf(errors, Array.isArray(bag.events), `${prefix}.events must be an array`);
  if (Array.isArray(bag.events)) {
    bag.events.forEach((ev, ei) => {
      const ep = `${prefix}.events[${ei}]`;
      pushIf(errors, isObject(ev), `${ep} must be an object`);
      if (!isObject(ev)) return;
      pushIf(errors, isNonEmptyString(ev.id), `${ep}.id must be a non-empty string`);
      pushIf(errors, isNonEmptyString(ev.name), `${ep}.name must be a non-empty string`);
    });
  }
}

function validatePlan_one(plan, idx, errors, warnings) {
  const prefix = `plans[${idx}]`;
  pushIf(errors, isObject(plan), `${prefix} must be an object`);
  if (!isObject(plan)) return;
  pushIf(errors, isNonEmptyString(plan.id), `${prefix}.id must be a non-empty string`);
  pushIf(errors, isNonEmptyString(plan.name), `${prefix}.name must be a non-empty string`);
  if (plan.milestones !== undefined) {
    pushIf(errors, Array.isArray(plan.milestones), `${prefix}.milestones must be an array`);
    if (Array.isArray(plan.milestones)) {
      plan.milestones.forEach((m, mi) => validateMilestone(m, idx, mi, errors, warnings));
    }
  }
  validateEventBag(plan.income, 'income', idx, errors);
  validateEventBag(plan.expenses, 'expenses', idx, errors);
  validateEventBag(plan.accounts, 'accounts', idx, errors);
  validateEventBag(plan.assets, 'assets', idx, errors);
}

export function validatePlan(plan) {
  const errors = [];
  const warnings = [];

  if (!isObject(plan)) {
    return { valid: false, errors: ['plan must be a JSON object'], warnings };
  }

  // top-level
  if (!isObject(plan.today)) {
    errors.push('top-level "today" must be an object');
  } else {
    validateAccountList(plan.today.savingsAccounts, 'savingsAccounts', errors, warnings);
    validateAccountList(plan.today.investmentAccounts, 'investmentAccounts', errors, warnings);
    if (!Array.isArray(plan.today.debts)) errors.push('today.debts must be an array');
    if (!Array.isArray(plan.today.assets)) errors.push('today.assets must be an array');
  }

  if (!Array.isArray(plan.plans) || plan.plans.length === 0) {
    errors.push('top-level "plans" must be a non-empty array');
  } else {
    plan.plans.forEach((p, i) => validatePlan_one(p, i, errors, warnings));
  }

  return { valid: errors.length === 0, errors, warnings };
}
