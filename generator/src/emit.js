/**
 * Emit — turn the reconciled abstract view into a PL-shaped plan.json.
 *
 * Strategy:
 *   - Read the existing data/plan.json (or fall back to plan.example.json
 *     for first-run bootstrap).
 *   - Preserve EVERYTHING in the existing plan except the account arrays in
 *     `today`: people demographics, plans[] (the 5 scenarios), variables,
 *     etc., all flow through unchanged. PR-K will revisit `plans`.
 *   - Replace `today.savingsAccounts / investmentAccounts / debts / assets`
 *     with the reconciled view, bucketed by category.
 *   - For each reconciled account: match to the existing plan.json by display
 *     name (case-insensitive). If found, KEEP the existing PL id (UUIDs are
 *     opaque to us, per docs/account-mapping.md). Update balance/name/type;
 *     preserve every other PL-specific field (color, icon, dividendRate, ...).
 *     If not found, build a new entry with sensible defaults.
 *   - By default, preserve existing accounts the reconciled view doesn't
 *     mention (`preserveUnmatched: true`). The docs say wholesale-restore
 *     drops missing entities, so opting out should be a deliberate decision.
 *   - Add `_meta`, `_drift`, `_provenance` keys. The userscript validator
 *     ignores unknown top-level keys; the validator we run here only checks
 *     structural shape.
 *   - Validate before write. Refuse to write when structurally invalid.
 *
 * --dry-run prints the JSON to stdout instead of writing.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePlan } from '../../userscript/src/plan-validator.js';
import { slugify } from './reconcile.js';
import { composeScenarioPlans } from './scenarios.js';

// ---------------------------------------------------------------------------
// Bucketing + defaults
// ---------------------------------------------------------------------------

const CATEGORY_TO_BUCKET = {
  cash: 'savingsAccounts', // PL's "savings" bucket holds checking too
  investment: 'investmentAccounts',
  debt: 'debts',
  asset: 'assets',
};

// Sensible defaults for newly-created accounts. PR-E intentionally keeps
// these minimal; PL's defaults fill in any gaps after restore. Anything
// matching an existing account preserves the existing PL-specific fields.
const DEFAULT_PER_BUCKET = {
  savingsAccounts: {
    color: 'blue-grey',
    icon: 'mdi-bank',
    liquid: true,
    owner: 'joint',
    dividendRate: 0,
    dividendType: 'percent',
    investmentGrowthRate: 0,
    investmentGrowthType: 'percent',
  },
  investmentAccounts: {
    color: 'indigo',
    icon: 'mdi-chart-line',
    country: 'us',
    liquid: false,
    owner: 'self',
    rmdType: 'auto',
    investmentGrowthRate: 7,
    investmentGrowthType: 'percent',
    hasEWPenalty: true,
    EWPenaltyRate: 10,
    EWAge: 59,
  },
  debts: {
    color: 'red',
    icon: 'mdi-credit-card',
    owner: 'joint',
  },
  assets: {
    color: 'brown',
    icon: 'mdi-home',
    owner: 'joint',
  },
};

/**
 * Pick the PL bucket name for a reconciled account.
 */
export function bucketFor(account) {
  return CATEGORY_TO_BUCKET[account?.category] || 'investmentAccounts';
}

/**
 * Build a stable PL `id` for a new account from its externalId. Existing PL
 * accounts keep their original opaque ids — this only fires for new ones.
 */
export function newAccountId(externalId) {
  return `acct-${externalId || 'unknown'}`;
}

/**
 * Convert a reconciled account into a PL-shaped account object, optionally
 * merging with an existing PL entry to preserve color/icon/dividendRate/etc.
 */
export function shapeAccount(reconciled, existing, bucket) {
  const defaults = DEFAULT_PER_BUCKET[bucket] || {};
  const base = existing ? { ...existing } : { ...defaults };

  base.id = existing?.id ?? newAccountId(reconciled.externalId);
  base.name = reconciled.displayName || existing?.name || base.id;
  if (reconciled.type) base.type = reconciled.type;
  else if (!base.type) base.type = inferTypeFromBucket(bucket);
  if (typeof reconciled.balance === 'number') base.balance = reconciled.balance;
  if (reconciled.owner) base.owner = reconciled.owner;

  if (typeof reconciled.growthAssumption === 'number') {
    // Memo stores growth as a fraction (0.07); PL uses percent (7).
    base.investmentGrowthRate = reconciled.growthAssumption * 100;
    base.investmentGrowthType = 'percent';
  }
  return base;
}

function inferTypeFromBucket(bucket) {
  switch (bucket) {
    case 'savingsAccounts':
      return 'savings';
    case 'investmentAccounts':
      return 'taxable';
    case 'debts':
      return 'credit-card';
    case 'assets':
      return 'real-estate';
    default:
      return 'taxable';
  }
}

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

function findExisting(existingList, reconciled) {
  if (!Array.isArray(existingList)) return null;
  const target = (reconciled.displayName || '').toLowerCase().trim();
  if (!target) return null;
  return (
    existingList.find((e) => (e.name || '').toLowerCase().trim() === target) ||
    existingList.find((e) => e.id === newAccountId(reconciled.externalId)) ||
    null
  );
}

/**
 * Merge a reconciled subset into an existing PL account list for a single
 * bucket. preserveUnmatched=true keeps existing entries that the reconciled
 * view doesn't mention.
 */
export function mergeAccountList(existingList, reconciledSubset, bucket, opts = {}) {
  const preserveUnmatched = opts.preserveUnmatched !== false;
  const usedExistingIds = new Set();
  const out = [];

  for (const acct of reconciledSubset) {
    const match = findExisting(existingList, acct);
    if (match) usedExistingIds.add(match.id);
    out.push(shapeAccount(acct, match, bucket));
  }

  if (preserveUnmatched && Array.isArray(existingList)) {
    for (const e of existingList) {
      if (!usedExistingIds.has(e.id)) out.push(e);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Base plan loading
// ---------------------------------------------------------------------------

function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function defaultPlanPath() {
  return resolve(repoRoot(), 'data', 'plan.json');
}

function examplePlanPath() {
  return resolve(repoRoot(), 'data', 'plan.example.json');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/**
 * Load the base plan to merge into. Order:
 *   1. opts.basePath explicit
 *   2. data/plan.json (real, gitignored)
 *   3. data/plan.example.json (sanitized, first-run scaffold)
 */
export async function loadBase(basePath) {
  if (basePath) {
    const p = isAbsolute(basePath) ? basePath : resolve(repoRoot(), basePath);
    if (!existsSync(p)) throw new Error(`base plan not found at ${p}`);
    return readJson(p);
  }
  const real = defaultPlanPath();
  if (existsSync(real)) return readJson(real);
  const example = examplePlanPath();
  if (existsSync(example)) return readJson(example);
  throw new Error(
    `no base plan found (looked at ${real} and ${example}); pass opts.basePath explicitly`,
  );
}

// ---------------------------------------------------------------------------
// Top-level emit
// ---------------------------------------------------------------------------

function buildMeta(reconciled, now) {
  return {
    schemaVersion: 3,
    generatedAt: now.toISOString(),
    generatedBy: 'projectionlab-finance-sync generator',
    sourceShas: reconciled._sources || null,
    accountsCount: reconciled.accounts.length,
    driftCount: reconciled.drift.length,
    sanityChecks: reconciled.sanityChecks || null,
  };
}

/**
 * Emit a reconciled view into a PL-shaped plan.json.
 *
 * @param {object} reconciled  - output of reconcile()
 * @param {object} [opts]
 * @param {boolean}[opts.dryRun]            - print to stdout instead of writing
 * @param {string} [opts.outPath]           - destination; default data/plan.json
 * @param {string} [opts.basePath]          - base plan to merge into
 * @param {boolean}[opts.preserveUnmatched] - keep PL accounts not in reconciled (default true)
 * @param {Date}   [opts.now]
 * @returns {Promise<{written:boolean, path:?string, warnings:string[], errors:string[]}>}
 */
export async function emit(reconciled, opts = {}) {
  if (!reconciled || !Array.isArray(reconciled.accounts)) {
    throw new Error('emit() requires a reconciled view with accounts[] (output of reconcile())');
  }
  const dryRun = !!opts.dryRun;
  const now = opts.now ?? new Date();
  const outPath = opts.outPath
    ? isAbsolute(opts.outPath)
      ? opts.outPath
      : resolve(repoRoot(), opts.outPath)
    : defaultPlanPath();

  const base = await loadBase(opts.basePath);
  const baseToday = base.today || {};

  const buckets = {
    savingsAccounts: [],
    investmentAccounts: [],
    debts: [],
    assets: [],
  };
  const skipped = [];
  for (const acct of reconciled.accounts) {
    // PL requires a finite numeric balance per account. Memo-only entries
    // with no extractable balance (e.g. Capital One Miles, raw points) are
    // skipped here and surfaced in warnings.
    if (typeof acct.balance !== 'number' || !Number.isFinite(acct.balance)) {
      skipped.push({
        externalId: acct.externalId,
        displayName: acct.displayName,
        reason: 'no finite balance',
      });
      continue;
    }
    buckets[bucketFor(acct)].push(acct);
  }

  // If memo declared scenarios, materialize one PL plan per scenario from the
  // first base plan as a template; otherwise pass through base.plans verbatim.
  const composed = composeScenarioPlans(base?.plans?.[0] || null, reconciled.scenarios);
  const planList = composed || base.plans || [];

  const newPlan = {
    ...base,
    plans: planList,
    _meta: buildMeta(reconciled, now),
    today: {
      ...baseToday,
      savingsAccounts: mergeAccountList(
        baseToday.savingsAccounts,
        buckets.savingsAccounts,
        'savingsAccounts',
        opts,
      ),
      investmentAccounts: mergeAccountList(
        baseToday.investmentAccounts,
        buckets.investmentAccounts,
        'investmentAccounts',
        opts,
      ),
      debts: mergeAccountList(baseToday.debts, buckets.debts, 'debts', opts),
      assets: mergeAccountList(baseToday.assets, buckets.assets, 'assets', opts),
    },
    _drift: reconciled.drift,
    _provenance: reconciled.provenance,
  };

  const v = validatePlan(newPlan);
  if (!v.valid) {
    const detail = v.errors.slice(0, 5).join('; ');
    throw new Error(`emit: plan validation failed (${v.errors.length} errors): ${detail}`);
  }

  const serialized = JSON.stringify(newPlan, null, 2);
  if (dryRun) {
    process.stdout.write(serialized + '\n');
    return { written: false, path: null, warnings: v.warnings, errors: [], skipped };
  }
  await writeFile(outPath, serialized, 'utf8');
  return { written: true, path: outPath, warnings: v.warnings, errors: [], skipped };
}

// Suppress an "unused" lint warning on slugify by re-exporting it for tests.
export { slugify };
