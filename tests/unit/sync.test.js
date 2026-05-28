import { describe, expect, it, vi } from 'vitest';
import { makePluginApiStub, makeValidPlan } from '../setup.js';
import { rollbackTo, syncPlan } from '../../userscript/src/sync.js';

describe('syncPlan', () => {
  it('refuses to sync an invalid plan and never touches PL', async () => {
    const pl = makePluginApiStub();
    const result = await syncPlan({}, pl, 'apikey');
    expect(result.ok).toBe(false);
    expect(result.errors[0].scope).toBe('validate-plan');
    expect(pl.validateApiKey).not.toHaveBeenCalled();
    expect(pl.exportData).not.toHaveBeenCalled();
    expect(pl.restoreCurrentFinances).not.toHaveBeenCalled();
    expect(pl.restorePlans).not.toHaveBeenCalled();
  });

  it('refuses to sync without an API key', async () => {
    const pl = makePluginApiStub();
    const result = await syncPlan(makeValidPlan(), pl, '');
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toMatch(/apiKey is required/);
    expect(pl.validateApiKey).not.toHaveBeenCalled();
  });

  it('runs the full 4-step sequence on a valid plan', async () => {
    const pl = makePluginApiStub();
    const plan = makeValidPlan();
    const result = await syncPlan(plan, pl, 'apikey');

    expect(result.ok).toBe(true);
    expect(pl.validateApiKey).toHaveBeenCalledWith({ key: 'apikey' });
    expect(pl.exportData).toHaveBeenCalledWith({ key: 'apikey' });
    expect(pl.restoreCurrentFinances).toHaveBeenCalledWith(plan.today, { key: 'apikey' });
    expect(pl.restorePlans).toHaveBeenCalledWith(plan.plans, { key: 'apikey' });

    expect(result.steps.map((s) => s.name)).toEqual([
      'validate-api-key',
      'export-data',
      'restore-current-finances',
      'restore-plans',
    ]);
    expect(result.steps.every((s) => s.ok)).toBe(true);
  });

  it('never calls restoreProgress or restoreSettings', async () => {
    const pl = makePluginApiStub();
    await syncPlan(makeValidPlan(), pl, 'apikey');
    expect(pl.restoreProgress).not.toHaveBeenCalled();
    expect(pl.restoreSettings).not.toHaveBeenCalled();
  });

  it('captures the exportData result as a rollback snapshot', async () => {
    const baseline = {
      meta: { v: 1 },
      today: { savingsAccounts: [{ id: 'old1', name: 'Old', type: 'savings', balance: 1 }] },
      plans: [{ id: 'old-plan', name: 'Old' }],
    };
    const pl = makePluginApiStub({ exportData: vi.fn(async () => baseline) });
    const result = await syncPlan(makeValidPlan(), pl, 'apikey');
    expect(result.rollbackSnapshot).toEqual(baseline);
  });

  it('stops the chain if validateApiKey throws', async () => {
    const pl = makePluginApiStub({
      validateApiKey: vi.fn(async () => {
        throw new Error('401 Unauthorized');
      }),
    });
    const result = await syncPlan(makeValidPlan(), pl, 'apikey');

    expect(result.ok).toBe(false);
    expect(pl.exportData).not.toHaveBeenCalled();
    expect(pl.restoreCurrentFinances).not.toHaveBeenCalled();
    expect(result.errors[0].scope).toBe('validate-api-key');
    expect(result.errors[0].message).toMatch(/401/);
  });

  it('stops before restore if exportData throws', async () => {
    const pl = makePluginApiStub({
      exportData: vi.fn(async () => {
        throw new Error('export broke');
      }),
    });
    const result = await syncPlan(makeValidPlan(), pl, 'apikey');

    expect(result.ok).toBe(false);
    expect(pl.restoreCurrentFinances).not.toHaveBeenCalled();
    expect(pl.restorePlans).not.toHaveBeenCalled();
    expect(result.errors.some((e) => e.scope === 'export-data')).toBe(true);
  });

  it('still attempts restorePlans even if restoreCurrentFinances fails', async () => {
    const pl = makePluginApiStub({
      restoreCurrentFinances: vi.fn(async () => {
        throw new Error('today failed');
      }),
    });
    const result = await syncPlan(makeValidPlan(), pl, 'apikey');

    expect(result.ok).toBe(false);
    expect(pl.restorePlans).toHaveBeenCalled();
    expect(result.errors.some((e) => e.scope === 'restore-current-finances')).toBe(true);
  });

  it('forwards validator warnings on the result', async () => {
    const plan = makeValidPlan();
    plan.today.investmentAccounts[0].type = 'mystery-type';
    const pl = makePluginApiStub();
    const result = await syncPlan(plan, pl, 'apikey');
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes('mystery-type'))).toBe(true);
  });
});

describe('rollbackTo', () => {
  it('rejects a missing snapshot', async () => {
    const pl = makePluginApiStub();
    const r = await rollbackTo(null, pl, 'apikey');
    expect(r.ok).toBe(false);
    expect(r.errors[0].scope).toBe('rollback');
  });

  it('rejects a missing api key', async () => {
    const pl = makePluginApiStub();
    const r = await rollbackTo({ today: {}, plans: [] }, pl, '');
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toMatch(/apiKey is required/);
  });

  it('pushes both today and plans from the snapshot', async () => {
    const pl = makePluginApiStub();
    const snap = {
      today: { savingsAccounts: [{ id: 'x', name: 'X', type: 'savings', balance: 1 }] },
      plans: [{ id: 'p', name: 'P' }],
    };
    const r = await rollbackTo(snap, pl, 'apikey');
    expect(r.ok).toBe(true);
    expect(pl.validateApiKey).toHaveBeenCalled();
    expect(pl.restoreCurrentFinances).toHaveBeenCalledWith(snap.today, { key: 'apikey' });
    expect(pl.restorePlans).toHaveBeenCalledWith(snap.plans, { key: 'apikey' });
  });

  it('aborts if validateApiKey throws', async () => {
    const pl = makePluginApiStub({
      validateApiKey: vi.fn(async () => {
        throw new Error('bad key');
      }),
    });
    const r = await rollbackTo({ today: {}, plans: [] }, pl, 'apikey');
    expect(r.ok).toBe(false);
    expect(pl.restoreCurrentFinances).not.toHaveBeenCalled();
    expect(pl.restorePlans).not.toHaveBeenCalled();
  });
});
