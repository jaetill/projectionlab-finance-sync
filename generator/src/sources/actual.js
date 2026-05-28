/**
 * Actual Budget source — fetches live balances via @actual-app/api.
 *
 * Scope (PR-A — scaffold): exported function signatures only.
 * Real implementation lands in PR-C.
 *
 * API gotchas (see also reference_actual_api_gotchas in user-memory; discovered
 * 2026-05-27 during Phase 2 category setup):
 *
 *   1. downloadBudget is POSITIONAL, not object-wrapped, despite docs.
 *      Correct:   api.downloadBudget(target.groupId)
 *      Wrong:     api.downloadBudget({ syncId: target.groupId })
 *
 *   2. The "syncId" parameter is matched against the BudgetFile's groupId field
 *      on the server, NOT cloudFileId. From getBudgets() output, use target.groupId.
 *
 *   3. Off-budget accounts can be excluded from analysis where appropriate via
 *      acct.offbudget — they're tracked balances, not budgeted spending.
 *
 *   4. API password reads from ACTUAL_PASSWORD env var. Never argv. Never config.
 *
 * @typedef {Object} ActualSnapshot
 * @property {string} serverUrl
 * @property {string} budgetName
 * @property {string} snapshotAt   ISO timestamp of fetch
 * @property {Array}  accounts     [{ id, name, type, offbudget, balance, lastSyncedAt }]
 */

const DEFAULT_SERVER = 'http://localhost:5006';

/**
 * Fetch a snapshot of accounts + balances from the running Actual server.
 * @param {Object} [opts]
 * @param {string} [opts.serverUrl=DEFAULT_SERVER]
 * @param {string} [opts.budgetName="My Finances"]
 * @returns {Promise<ActualSnapshot>}
 */
export async function fetchActualSnapshot(opts = {}) {
  const { serverUrl = DEFAULT_SERVER, budgetName = 'My Finances' } = opts;
  throw new Error(
    `actual.fetchActualSnapshot() not implemented yet (PR-C scope); ` +
      `would connect to ${serverUrl} budget=${budgetName}`,
  );
}
