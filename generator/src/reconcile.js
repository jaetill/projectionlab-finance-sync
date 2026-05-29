/**
 * Reconcile — pure function over memo + actual + manual sources.
 *
 * Produces an abstract per-account view that PR-E will translate into PL's
 * plan.json shape (savingsAccounts / investmentAccounts / debts / assets).
 *
 * Field ownership (per integration-design.md §2 and config/reconcile-rules.json):
 *   - balance: tracker wins (Actual) → memo → manual; per-class drift threshold
 *   - name/type/owner/growthAssumption: memo wins; tracker only fills nulls
 *   - splits, status, uuid: memo only
 *   - manual: only for accounts neither memo nor tracker can speak for
 *
 * Account matching strategy (memo ↔ Actual):
 *   1. Explicit override in rules.accountMapping[externalId].actualId
 *   2. Exact case-insensitive name match
 *   3. Substring name match (one contains the other) — last resort
 *   4. Unmatched on either side → flagged in the output for the drift report
 *
 * Output shape:
 *   {
 *     accounts:        [{ externalId, displayName, owner, type, category,
 *                         balance, asOf, splits, growthAssumption, uuid,
 *                         status, source }],
 *     drift:           [{ externalId, field, memoValue, trackerValue, delta,
 *                         threshold, status }],
 *     provenance:      [{ externalId, field, source, sourceDetail }],
 *     unmatchedMemo:   [memoAcct displayNames],
 *     unmatchedActual: [actualAcct names],
 *     sanityChecks:    pass-through from the Actual snapshot
 *   }
 */

// ---------------------------------------------------------------------------
// Constants + helpers
// ---------------------------------------------------------------------------

// Map memo "type" tags (free-form) to plan.json account categories.
// PR-E will translate further into PL's savingsAccounts / investmentAccounts /
// debts / assets buckets.
const TYPE_TO_CATEGORY = {
  checking: 'cash',
  savings: 'cash',
  cd: 'cash',
  '401k': 'investment',
  ira: 'investment',
  'traditional-ira': 'investment',
  'roth-ira': 'investment',
  'rollover-ira': 'investment',
  brokerage: 'investment',
  taxable: 'investment',
  investment: 'investment',
  'real-estate': 'asset',
  credit: 'debt',
  'credit-card': 'debt',
  creditcard: 'debt',
  mortgage: 'debt',
};

// Map plan.json category → drift-threshold bucket in reconcile-rules.json.
const CATEGORY_TO_THRESHOLD_KEY = {
  cash: 'savings', // fall back to savings threshold for cash; checking/savings/cd handled in classifyDriftBucket
  investment: 'investment',
  asset: 'investment',
  debt: 'creditCard',
};

/**
 * Pick the drift-threshold bucket for a normalized account.
 * Order: explicit type match → category → default 'investment' (loud).
 */
export function classifyDriftBucket(type, category) {
  if (!type && !category) return 'investment';
  const t = (type || '').toLowerCase();
  if (t === 'checking') return 'checking';
  if (t === 'savings') return 'savings';
  if (t === 'cd') return 'cd';
  if (t === 'credit' || t === 'credit-card' || t === 'creditcard') return 'creditCard';
  return CATEGORY_TO_THRESHOLD_KEY[category] || 'investment';
}

/**
 * Slugify a display name into a stable externalId.
 * "TSP (L2035/L2040 50/50)" → "tsp-l2035-l2040-50-50"
 */
export function slugify(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[()[\]]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Decide the externalId for a memo account.
 * Priority: explicit [externalid:foo] tag → uuid tag → slug(displayName).
 */
export function externalIdForMemo(memoAcct) {
  return memoAcct?.externalId || memoAcct?.uuid || slugify(memoAcct?.displayName || '');
}

// ---------------------------------------------------------------------------
// Account matching
// ---------------------------------------------------------------------------

/**
 * Pair memo accounts with Actual accounts using the priority described above.
 * Returns:
 *   - pairs: [{ externalId, memo, actual }]   (paired or memo-only)
 *   - actualOnly: [actualAcct]                (in tracker but no memo entry)
 */
export function matchAccounts(memoAccounts, actualAccounts, rules = {}) {
  const overrides = rules.accountMapping || {};
  const actualById = new Map((actualAccounts || []).map((a) => [a.actualId, a]));
  const usedActualIds = new Set();
  const pairs = [];

  for (const memo of memoAccounts || []) {
    const externalId = externalIdForMemo(memo);
    let actual = null;

    // 1) explicit override
    const ov = overrides[externalId];
    if (ov && ov.actualId && actualById.has(ov.actualId)) {
      actual = actualById.get(ov.actualId);
    }

    // 2) exact name (case-insensitive), skipping already-used Actual accounts
    if (!actual) {
      const norm = (s) => (s || '').toLowerCase().trim();
      const memoNorm = norm(memo.displayName);
      actual = (actualAccounts || []).find(
        (a) => !usedActualIds.has(a.actualId) && norm(a.name) === memoNorm,
      );
    }

    // 3) substring match — looser, last resort
    if (!actual) {
      const memoNorm = (memo.displayName || '').toLowerCase();
      actual = (actualAccounts || []).find((a) => {
        if (usedActualIds.has(a.actualId)) return false;
        const aNorm = (a.name || '').toLowerCase();
        return aNorm.includes(memoNorm) || memoNorm.includes(aNorm);
      });
    }

    if (actual) usedActualIds.add(actual.actualId);
    pairs.push({ externalId, memo, actual });
  }

  const actualOnly = (actualAccounts || []).filter((a) => !usedActualIds.has(a.actualId));
  return { pairs, actualOnly };
}

// ---------------------------------------------------------------------------
// Per-field reconcile + drift
// ---------------------------------------------------------------------------

function reconcileBalance(memo, actual, manual) {
  if (actual && typeof actual.balance === 'number') {
    return { value: actual.balance, source: 'tracker', asOf: actual.reconciledAt || null };
  }
  if (memo && typeof memo.balance === 'number') {
    return { value: memo.balance, source: 'memo', asOf: memo.asOf };
  }
  if (manual && typeof manual.balance === 'number') {
    return { value: manual.balance, source: 'manual', asOf: manual.asOf || null };
  }
  return { value: null, source: null, asOf: null };
}

function reconcileMetadata(memo, actual, manual) {
  const pick = (field) => memo?.[field] ?? actual?.[field] ?? manual?.[field] ?? null;
  return {
    displayName: memo?.displayName ?? actual?.name ?? manual?.displayName ?? null,
    type: pick('type'),
    owner: pick('owner'),
    growthAssumption: memo?.growthAssumption ?? manual?.growthAssumption ?? null,
    splits: memo?.splits ?? null,
    status: memo?.status ?? null,
    uuid: memo?.uuid ?? null,
  };
}

/**
 * Compute drift for a paired account. Returns null when no drift to report
 * (either no data on one side, or delta within threshold).
 */
export function computeAccountDrift(externalId, memo, actual, rules) {
  if (!memo || !actual) return null;
  if (typeof memo.balance !== 'number' || typeof actual.balance !== 'number') return null;

  const delta = actual.balance - memo.balance;
  const bucket = classifyDriftBucket(memo.type || actual.type, null);
  const threshold = rules?.driftThresholds?.[bucket];
  // threshold == 0 means "always log" (investment); threshold == undefined
  // means "no threshold configured" — log to be safe.
  if (typeof threshold === 'number' && Math.abs(delta) <= threshold) return null;

  return {
    externalId,
    field: 'balance',
    memoValue: memo.balance,
    trackerValue: actual.balance,
    delta,
    threshold: threshold ?? null,
    bucket,
    status: 'drifted',
  };
}

// ---------------------------------------------------------------------------
// Top-level entrypoint
// ---------------------------------------------------------------------------

/**
 * Reconcile memo + actual + manual into a coherent abstract account view
 * plus drift and provenance audit trails.
 *
 * @param {object} input
 * @param {{accounts: Array}}            input.memo
 * @param {{accounts: Array, sanityChecks: object}|null} input.actual
 * @param {Array}                        [input.manual]
 * @param {object}                       input.rules
 */
export function reconcile(input) {
  if (!input || !input.memo) {
    throw new Error('reconcile() requires { memo, actual?, manual?, rules } — memo is required');
  }
  const memoAccounts = input.memo.accounts || [];
  const actualSnapshot = input.actual || null;
  const actualAccounts = actualSnapshot?.accounts || [];
  const manualEntries = input.manual || [];
  const rules = input.rules || {};

  const manualByExternalId = new Map(
    manualEntries.map((e) => [e.externalId || slugify(e.displayName || ''), e]),
  );

  const { pairs, actualOnly } = matchAccounts(memoAccounts, actualAccounts, rules);

  const accounts = [];
  const drift = [];
  const provenance = [];

  for (const { externalId, memo, actual } of pairs) {
    const manual = manualByExternalId.get(externalId) || null;
    const bal = reconcileBalance(memo, actual, manual);
    const meta = reconcileMetadata(memo, actual, manual);
    const category = TYPE_TO_CATEGORY[(meta.type || '').toLowerCase()] || null;

    accounts.push({
      externalId,
      displayName: meta.displayName,
      owner: meta.owner,
      type: meta.type,
      category,
      balance: bal.value,
      asOf: bal.asOf,
      splits: meta.splits,
      growthAssumption: meta.growthAssumption,
      uuid: meta.uuid,
      status: meta.status,
      source: bal.source,
    });

    provenance.push({ externalId, field: 'balance', source: bal.source, sourceDetail: bal.asOf });
    if (meta.displayName)
      provenance.push({ externalId, field: 'displayName', source: memo ? 'memo' : 'tracker' });
    if (meta.type)
      provenance.push({ externalId, field: 'type', source: memo?.type ? 'memo' : 'tracker' });
    if (meta.owner) provenance.push({ externalId, field: 'owner', source: 'memo' });
    if (meta.growthAssumption !== null && meta.growthAssumption !== undefined)
      provenance.push({ externalId, field: 'growthAssumption', source: 'memo' });

    const d = computeAccountDrift(externalId, memo, actual, rules);
    if (d) drift.push(d);
  }

  return {
    accounts,
    drift,
    provenance,
    unmatchedMemo: pairs.filter((p) => !p.actual).map((p) => p.memo.displayName),
    unmatchedActual: actualOnly.map((a) => a.name),
    sanityChecks: actualSnapshot?.sanityChecks ?? null,
    scenarios: input.memo?.scenarios || [],
  };
}
