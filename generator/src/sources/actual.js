/**
 * Actual Budget source — pulls live balances and 90-day category spend.
 *
 * Auth/config via env (no flags, no config files for secrets):
 *   ACTUAL_PASSWORD     — required; server password
 *   ACTUAL_BUDGET_NAME  — required; budget to download (e.g. "Tilley Household")
 *   ACTUAL_SERVER       — default 'http://localhost:5006'
 *   ACTUAL_DATA_DIR     — default OS tmpdir + 'actual-cache'
 *
 * API gotchas (per [[reference_actual_api_gotchas]]):
 *   - `downloadBudget(syncId, opts?)` is POSITIONAL, not `{ syncId }`
 *   - the "syncId" parameter is matched against the budget's `groupId`
 *     field on the server, NOT `cloudFileId`. Use `target.groupId`.
 *
 * Output shape:
 *   {
 *     fetchedAt: ISO string,
 *     serverUrl, budgetName, windowDays, windowStart, windowEnd,
 *     accounts:        [{ actualId, name, type, offBudget, closed, balance }],
 *     categorySpend90d:[{ categoryId, name, groupName, total, monthlyAvg, txnCount }],
 *     sanityChecks:    { unmarkedTransfers, uncategorized, staleAccounts: [...] }
 *   }
 *
 * Dependency injection: `opts.api` can be passed for testing; in production it
 * is omitted and the real `@actual-app/api` package is dynamic-imported.
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

const DEFAULT_SERVER = 'http://localhost:5006';
const DEFAULT_DATA_DIR_NAME = 'actual-cache';
const STALE_THRESHOLD_DAYS = 7;

// ---------------------------------------------------------------------------
// Helpers (exported for testability)
// ---------------------------------------------------------------------------

// Indirection so vite's import-analysis can't statically resolve the
// @actual-app/api specifier at test transform time.
function actualApiSpecifier() {
  return '@actual-app/api';
}

/**
 * Read config from an env-like object. Throws helpfully when required fields
 * are missing — the only safe failure mode here is loud.
 */
export function readConfig(env) {
  const password = env.ACTUAL_PASSWORD;
  if (!password) {
    throw new Error('ACTUAL_PASSWORD env var is required (server password for Actual Budget)');
  }
  const budgetName = env.ACTUAL_BUDGET_NAME;
  if (!budgetName) {
    throw new Error(
      'ACTUAL_BUDGET_NAME env var is required (name of the budget file to download, e.g. "Tilley Household")',
    );
  }
  return {
    password,
    serverUrl: env.ACTUAL_SERVER || DEFAULT_SERVER,
    budgetName,
    dataDir: env.ACTUAL_DATA_DIR || join(tmpdir(), DEFAULT_DATA_DIR_NAME),
  };
}

/**
 * Normalize an Actual account record into the shape we use downstream.
 * Cents -> dollars; bool fields coerced. Unknown fields preserved untouched.
 */
export function normalizeAccount(raw) {
  return {
    actualId: raw.id,
    name: raw.name,
    type: raw.type ?? null,
    offBudget: !!raw.offbudget,
    closed: !!raw.closed,
    balance: typeof raw.balance === 'number' ? raw.balance / 100 : null,
  };
}

/**
 * Roll up transactions into per-category spend totals + monthly averages.
 *
 * Excludes:
 *   - transactions with transfer_id (transfers between accounts)
 *   - transactions with no category (uncategorized — sanity-check flags these)
 *   - transactions on income categories (is_income flag set on the category)
 *
 * @param {Array}                                txns
 * @param {Map<string,{id,name,group_id,is_income}>} catById
 * @param {Map<string,{id,name}>}                groupById
 * @param {number}                               windowDays
 * @returns {Array<{categoryId,name,groupName,total,monthlyAvg,txnCount}>}
 */
export function rollupCategorySpend(txns, catById, groupById, windowDays = 90) {
  const byCategory = new Map();
  for (const t of txns) {
    if (t.transfer_id) continue;
    if (t.category === null || t.category === undefined) continue;
    const cat = catById.get(t.category);
    if (!cat || cat.is_income) continue;
    const entry = byCategory.get(cat.id) ?? {
      categoryId: cat.id,
      name: cat.name,
      groupName: groupById.get(cat.group_id)?.name ?? null,
      totalCents: 0,
      txnCount: 0,
    };
    entry.totalCents += t.amount;
    entry.txnCount += 1;
    byCategory.set(cat.id, entry);
  }
  // Actual stores cents; expenses are negative. Flip sign and convert.
  const monthFactor = windowDays / 30;
  return [...byCategory.values()]
    .map((e) => ({
      categoryId: e.categoryId,
      name: e.name,
      groupName: e.groupName,
      total: -e.totalCents / 100,
      monthlyAvg: -e.totalCents / 100 / monthFactor,
      txnCount: e.txnCount,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Compute the three sanity-check signals required before category rollups can
 * be trusted (per integration-design.md §3 step 3):
 *
 *   - unmarkedTransfers: how many txns LOOK like transfers but aren't marked
 *   - uncategorized:     how many txns have no category assignment
 *   - staleAccounts:     accounts whose last sync is > STALE_THRESHOLD_DAYS old
 *
 * Unmarked-transfer detection is heuristic: payee name contains "transfer" but
 * transfer_id is unset. Catches the common Actual gotcha where a manual import
 * doesn't auto-link the matched transactions across accounts.
 */
export function computeSanityChecks(txns, rawAccounts, now = new Date()) {
  // Heuristic for "looks like a transfer but isn't marked as one."
  const looksLikeTransfer = (t) => !t.transfer_id && t.payee_name && /transfer/i.test(t.payee_name);

  const unmarkedTransfers = txns.filter(looksLikeTransfer).length;

  // Uncategorized excludes things already caught by the unmarked-transfer
  // bucket; each row should motivate exactly one action.
  const uncategorized = txns.filter(
    (t) =>
      !t.transfer_id &&
      (t.category === null || t.category === undefined) &&
      !t.is_parent &&
      !looksLikeTransfer(t),
  ).length;

  const staleAccounts = [];
  const ms = 1000 * 60 * 60 * 24;
  for (const a of rawAccounts) {
    if (a.closed) continue;
    if (!a.last_reconciled) continue;
    const ageDays = (now.getTime() - new Date(a.last_reconciled).getTime()) / ms;
    if (ageDays > STALE_THRESHOLD_DAYS) {
      staleAccounts.push({
        name: a.name,
        lastReconciledAt: a.last_reconciled,
        ageDays: Math.round(ageDays),
      });
    }
  }

  return { unmarkedTransfers, uncategorized, staleAccounts };
}

/**
 * Build the ISO date string Actual expects (YYYY-MM-DD).
 */
function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

/**
 * Fetch a snapshot from Actual Budget.
 *
 * @param {object} [opts]
 * @param {object} [opts.env]        - env-like map; defaults to process.env
 * @param {object} [opts.api]        - injected @actual-app/api for tests
 * @param {Date}   [opts.now]        - "today" for the window; defaults to new Date()
 * @param {number} [opts.windowDays] - default 90
 * @returns {Promise<object>}
 */
export async function fetchActualSnapshot(opts = {}) {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? 90;
  const config = readConfig(env);

  // Dynamic import so the package only loads when the snapshot is actually
  // requested in production; tests inject opts.api and skip the import entirely.
  // The specifier is held in a variable so vite's static import-analysis
  // doesn't try to resolve the package at transform time. @actual-app/api is
  // a real runtime dep; tests inject opts.api and never hit this branch.
  const api = opts.api ?? (await import(actualApiSpecifier()));

  // @actual-app/api doesn't auto-create dataDir; recursively mkdir so a fresh
  // user (or a $env:TEMP that's been cleaned) doesn't fail with ENOENT.
  await mkdir(config.dataDir, { recursive: true });

  await api.init({
    dataDir: config.dataDir,
    serverURL: config.serverUrl,
    password: config.password,
  });

  try {
    const budgets = await api.getBudgets();
    const target = budgets.find((b) => b.name === config.budgetName);
    if (!target) {
      const names = budgets.map((b) => `"${b.name}"`).join(', ') || '(none)';
      throw new Error(
        `budget "${config.budgetName}" not found on Actual server; available: ${names}`,
      );
    }
    // POSITIONAL syncId argument; use groupId, NOT cloudFileId.
    // See [[reference_actual_api_gotchas]].
    await api.downloadBudget(target.groupId);

    const [rawAccounts, rawCategories, rawGroups] = await Promise.all([
      api.getAccounts(),
      api.getCategories(),
      api.getCategoryGroups(),
    ]);

    const catById = new Map(rawCategories.map((c) => [c.id, c]));
    const groupById = new Map(rawGroups.map((g) => [g.id, g]));

    const start = new Date(now);
    start.setDate(start.getDate() - windowDays);

    const allTxns = [];
    for (const acct of rawAccounts) {
      if (acct.closed) continue;
      const txns = await api.getTransactions(acct.id, fmtDate(start), fmtDate(now));
      for (const t of txns) {
        allTxns.push({ ...t, accountId: acct.id, accountName: acct.name });
      }
    }

    return {
      fetchedAt: now.toISOString(),
      serverUrl: config.serverUrl,
      budgetName: config.budgetName,
      windowDays,
      windowStart: fmtDate(start),
      windowEnd: fmtDate(now),
      accounts: rawAccounts.map(normalizeAccount),
      categorySpend90d: rollupCategorySpend(allTxns, catById, groupById, windowDays),
      sanityChecks: computeSanityChecks(allTxns, rawAccounts, now),
    };
  } finally {
    try {
      await api.shutdown();
    } catch {
      // shutdown failures shouldn't mask the caller's primary result/error
    }
  }
}
