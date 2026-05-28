// Orchestrates a ProjectionLab sync. Architecture (per docs/pl-api-cheatsheet.md):
//
//   1. validateApiKey      — fast-fail if the key is wrong
//   2. exportData          — captured as the rollback baseline BEFORE we mutate PL
//   3. restoreCurrentFinances(plan.today)
//   4. restorePlans(plan.plans)
//
// We deliberately do NOT call restoreProgress or restoreSettings (user-owned).
//
// The result is structured so the UI can show a status panel and the user can
// roll back via the rollbackTo() function if PL ends up in an unexpected state.

import { validatePlan } from './plan-validator.js';

export function emptyResult() {
  return {
    ok: true,
    steps: [],
    rollbackSnapshot: null,
    errors: [],
    warnings: [],
    startedAt: null,
    finishedAt: null,
  };
}

async function runStep(name, fn, result) {
  const startedAt = Date.now();
  try {
    const value = await fn();
    result.steps.push({ name, ok: true, durationMs: Date.now() - startedAt });
    return { ok: true, value };
  } catch (err) {
    const message = err?.message ?? String(err);
    result.steps.push({ name, ok: false, durationMs: Date.now() - startedAt, error: message });
    result.errors.push({ scope: name, message });
    result.ok = false;
    return { ok: false, error: err };
  }
}

export async function syncPlan(plan, pl, apiKey, now = () => Date.now()) {
  const result = emptyResult();
  result.startedAt = now();

  // 0. Structural validation — never touches PL.
  const validation = validatePlan(plan);
  if (!validation.valid) {
    result.ok = false;
    result.errors.push({ scope: 'validate-plan', message: validation.errors.join('; ') });
    result.finishedAt = now();
    return result;
  }
  if (validation.warnings?.length) {
    result.warnings.push(...validation.warnings);
  }

  if (!apiKey) {
    result.ok = false;
    result.errors.push({ scope: 'validate-plan', message: 'apiKey is required' });
    result.finishedAt = now();
    return result;
  }

  const options = { key: apiKey };

  // 1. validateApiKey
  const step1 = await runStep('validate-api-key', () => pl.validateApiKey(options), result);
  if (!step1.ok) {
    result.finishedAt = now();
    return result;
  }

  // 2. exportData — snapshot the current state for rollback.
  const step2 = await runStep('export-data', () => pl.exportData(options), result);
  if (!step2.ok) {
    result.finishedAt = now();
    return result;
  }
  result.rollbackSnapshot = step2.value;

  // 3. restoreCurrentFinances
  await runStep(
    'restore-current-finances',
    () => pl.restoreCurrentFinances(plan.today, options),
    result,
  );

  // 4. restorePlans — even if step 3 failed, we still attempt 4 so the user
  // gets a complete picture of what worked and what didn't. They can always
  // roll back from the snapshot.
  await runStep('restore-plans', () => pl.restorePlans(plan.plans, options), result);

  result.finishedAt = now();
  return result;
}

// Push a previously-captured snapshot back to PL — reverses a sync.
// Used by the "Rollback to last snapshot" menu command.
export async function rollbackTo(snapshot, pl, apiKey, now = () => Date.now()) {
  const result = emptyResult();
  result.startedAt = now();

  if (!snapshot || typeof snapshot !== 'object') {
    result.ok = false;
    result.errors.push({ scope: 'rollback', message: 'snapshot is missing or invalid' });
    result.finishedAt = now();
    return result;
  }
  if (!apiKey) {
    result.ok = false;
    result.errors.push({ scope: 'rollback', message: 'apiKey is required' });
    result.finishedAt = now();
    return result;
  }

  const options = { key: apiKey };
  await runStep('validate-api-key', () => pl.validateApiKey(options), result);
  if (!result.ok) {
    result.finishedAt = now();
    return result;
  }

  if (snapshot.today !== undefined) {
    await runStep(
      'restore-current-finances',
      () => pl.restoreCurrentFinances(snapshot.today, options),
      result,
    );
  }
  if (Array.isArray(snapshot.plans)) {
    await runStep('restore-plans', () => pl.restorePlans(snapshot.plans, options), result);
  }

  result.finishedAt = now();
  return result;
}
