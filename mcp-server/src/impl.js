/**
 * Default generator implementation injected into the MCP tool handlers.
 *
 * Thin shim around the generator's exported functions — same shape the cli.js
 * runPipeline() uses but exposed as discrete callable methods so tests can
 * mock individual pieces.
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseMemo } from '../../generator/src/sources/memo.js';
import { fetchActualSnapshot } from '../../generator/src/sources/actual.js';
import { getManualEntries } from '../../generator/src/sources/manual.js';
import { reconcile } from '../../generator/src/reconcile.js';
import { emit } from '../../generator/src/emit.js';
import { buildDriftReport } from '../../generator/src/drift-report.js';

function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

async function loadRules() {
  const p = resolve(repoRoot(), 'generator', 'config', 'reconcile-rules.json');
  return JSON.parse(await readFile(p, 'utf8'));
}

function actualConfigured(env = process.env) {
  return !!(env.ACTUAL_PASSWORD && env.ACTUAL_BUDGET_NAME);
}

export const defaultImpl = {
  async runPipeline({ memoPath, ephemeralScenarios = [], dryRun = false, includeEmit = true }) {
    const rules = await loadRules();
    const memo = await parseMemo(memoPath);

    // Splice ephemeral scenarios onto whatever the memo already declared.
    if (ephemeralScenarios.length > 0) {
      memo.scenarios = [...(memo.scenarios || []), ...ephemeralScenarios];
    }

    const actual = actualConfigured() ? await fetchActualSnapshot() : null;
    const manual = await getManualEntries();
    const reconciled = reconcile({ memo, actual, manual, rules });
    reconciled._sources = { memo: memo.sourceSha, actual: actual?.fetchedAt || null };

    let emitResult = null;
    if (includeEmit) {
      emitResult = await emit(reconciled, { dryRun });
    }
    const driftMarkdown = buildDriftReport(reconciled, {
      skipped: emitResult?.skipped,
    });
    return { memo, actual, reconciled, emit: emitResult, driftMarkdown };
  },

  async check({ memoPath }) {
    const memo = await parseMemo(memoPath);
    const out = {
      memo: {
        ok: true,
        accountsCount: memo.accounts.length,
        incomeStreams: memo.income.length,
        scenarios: memo.scenarios?.length || 0,
      },
      actual: { configured: actualConfigured() },
    };
    if (actualConfigured()) {
      try {
        const snap = await fetchActualSnapshot();
        out.actual.ok = true;
        out.actual.accountsCount = snap.accounts.length;
      } catch (e) {
        out.actual.ok = false;
        out.actual.error = e.message;
      }
    }
    return out;
  },

  async actualSnapshot() {
    if (!actualConfigured()) {
      throw new Error('ACTUAL_PASSWORD + ACTUAL_BUDGET_NAME must be set to query Actual');
    }
    return fetchActualSnapshot();
  },
};
