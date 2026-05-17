// Lightweight validator for plan.json. Returns { valid, errors } — never throws,
// because callers (UI + sync) need to surface specific errors to the user.

export const CURRENT_SCHEMA_VERSION = 1;
export const ACCOUNT_TYPES = new Set([
  'TAXABLE_BROKERAGE',
  'TRADITIONAL_IRA',
  'ROTH_IRA',
  'TRADITIONAL_401K',
  'ROTH_401K',
  'CHECKING',
  'SAVINGS',
  'HSA',
  'CRYPTO',
  'REAL_ESTATE',
  'OTHER',
]);
export const FREQUENCIES = new Set(['ANNUAL', 'MONTHLY', 'WEEKLY', 'ONE_TIME']);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function pushIf(errors, condition, message) {
  if (!condition) errors.push(message);
}

function validateAccount(account, index, errors) {
  const prefix = `accounts[${index}]`;
  pushIf(
    errors,
    typeof account?.name === 'string' && account.name.length > 0,
    `${prefix}.name is required`,
  );
  pushIf(
    errors,
    ACCOUNT_TYPES.has(account?.type),
    `${prefix}.type must be one of ${[...ACCOUNT_TYPES].join(', ')}`,
  );
  pushIf(errors, isFiniteNumber(account?.balance), `${prefix}.balance must be a finite number`);
  pushIf(
    errors,
    typeof account?.currency === 'string' && account.currency.length === 3,
    `${prefix}.currency must be a 3-letter code`,
  );
}

function validateIncome(item, index, errors) {
  const prefix = `income[${index}]`;
  pushIf(errors, typeof item?.label === 'string', `${prefix}.label is required`);
  pushIf(errors, isFiniteNumber(item?.amount), `${prefix}.amount must be a finite number`);
  pushIf(
    errors,
    FREQUENCIES.has(item?.frequency),
    `${prefix}.frequency must be one of ${[...FREQUENCIES].join(', ')}`,
  );
  if (item?.startDate !== undefined && item.startDate !== null) {
    pushIf(errors, ISO_DATE.test(item.startDate), `${prefix}.startDate must be YYYY-MM-DD`);
  }
}

function validateExpense(item, index, errors) {
  const prefix = `expenses[${index}]`;
  pushIf(errors, typeof item?.label === 'string', `${prefix}.label is required`);
  pushIf(errors, isFiniteNumber(item?.amount), `${prefix}.amount must be a finite number`);
  pushIf(
    errors,
    FREQUENCIES.has(item?.frequency),
    `${prefix}.frequency must be one of ${[...FREQUENCIES].join(', ')}`,
  );
}

function validateMilestone(item, index, errors) {
  const prefix = `milestones[${index}]`;
  pushIf(errors, typeof item?.label === 'string', `${prefix}.label is required`);
  pushIf(
    errors,
    typeof item?.date === 'string' && ISO_DATE.test(item.date),
    `${prefix}.date must be YYYY-MM-DD`,
  );
}

export function validatePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') {
    return { valid: false, errors: ['plan must be a JSON object'] };
  }
  pushIf(
    errors,
    plan.schemaVersion === CURRENT_SCHEMA_VERSION,
    `schemaVersion must be ${CURRENT_SCHEMA_VERSION}`,
  );
  pushIf(
    errors,
    typeof plan.asOfDate === 'string' && ISO_DATE.test(plan.asOfDate),
    'asOfDate must be YYYY-MM-DD',
  );
  pushIf(
    errors,
    Array.isArray(plan.accounts) && plan.accounts.length > 0,
    'accounts must be a non-empty array',
  );

  if (Array.isArray(plan.accounts)) plan.accounts.forEach((a, i) => validateAccount(a, i, errors));
  if (Array.isArray(plan.income)) plan.income.forEach((a, i) => validateIncome(a, i, errors));
  if (Array.isArray(plan.expenses)) plan.expenses.forEach((a, i) => validateExpense(a, i, errors));
  if (Array.isArray(plan.milestones))
    plan.milestones.forEach((a, i) => validateMilestone(a, i, errors));

  return { valid: errors.length === 0, errors };
}
