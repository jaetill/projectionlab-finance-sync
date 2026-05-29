/**
 * Drift Report — turn reconciled output into a human-readable markdown digest.
 *
 * The drift report is the actual human interface to the generator. plan.json
 * is for the userscript; drift.md is for Jason. Sections:
 *
 *   1. Headline — quick counts for at-a-glance triage
 *   2. Account drift — table of memo-vs-tracker deltas exceeding threshold
 *   3. Unmatched — memo accounts the tracker doesn't see, and vice versa
 *   4. Sanity checks — pre-flight signals (unmarked transfers, uncategorized,
 *                      stale account syncs) carried through from the Actual
 *                      snapshot
 *   5. Spending drift — TODO (PR-F+); needs categorySpend90d passthrough
 *
 * Pure function over the reconciled view. No I/O, no side effects.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a number as USD with sign and grouping. Returns "—" for null/undefined.
 */
export function fmtMoney(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/**
 * Format a delta with explicit + / - sign.
 */
export function fmtDelta(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '-';
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function fmtDate(iso, fallback = '—') {
  if (!iso) return fallback;
  // ISO timestamp -> YYYY-MM-DD
  return iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function headline(reconciled, opts) {
  const driftCount = reconciled.drift.length;
  const unmatchedMemoCount = reconciled.unmatchedMemo.length;
  const unmatchedActualCount = reconciled.unmatchedActual.length;
  const sanity = reconciled.sanityChecks;

  const lines = [
    `## Headline`,
    ``,
    `- **${driftCount}** account drift${driftCount === 1 ? '' : 's'} beyond threshold`,
    `- **${unmatchedMemoCount}** memo account${unmatchedMemoCount === 1 ? '' : 's'} not seen in tracker`,
    `- **${unmatchedActualCount}** tracker account${unmatchedActualCount === 1 ? '' : 's'} not in memo`,
  ];
  if (sanity) {
    lines.push(
      `- **${sanity.unmarkedTransfers}** unmarked transfer${sanity.unmarkedTransfers === 1 ? '' : 's'}`,
      `- **${sanity.uncategorized}** uncategorized transaction${sanity.uncategorized === 1 ? '' : 's'}`,
      `- **${sanity.staleAccounts.length}** stale account sync${sanity.staleAccounts.length === 1 ? '' : 's'} (>7d)`,
    );
  } else {
    lines.push(`- _(Actual not consulted this run — no sanity checks)_`);
  }
  if (opts.skipped && opts.skipped.length) {
    lines.push(
      `- **${opts.skipped.length}** account${opts.skipped.length === 1 ? '' : 's'} skipped (no finite balance — points/rewards, missing data)`,
    );
  }
  return lines.join('\n');
}

function accountDriftSection(reconciled) {
  if (!reconciled.drift.length) {
    return `## Account drift\n\nNo accounts exceeded threshold. ✓`;
  }
  // Build a quick lookup so we can show display names + asOf alongside the
  // drift entry (which only carries externalId).
  const acctByExt = new Map(reconciled.accounts.map((a) => [a.externalId, a]));

  const rows = reconciled.drift
    .slice()
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .map((d) => {
      const acct = acctByExt.get(d.externalId) || {};
      const name = acct.displayName || d.externalId;
      const memoAsOf = fmtDate(acct.asOf);
      return `| ${name} | ${fmtMoney(d.memoValue)} (${memoAsOf}) | ${fmtMoney(d.trackerValue)} | ${fmtDelta(d.delta)} | ${d.threshold === null ? '—' : fmtMoney(d.threshold)} | ${d.bucket || '—'} |`;
    });

  return [
    `## Account drift`,
    ``,
    `| Account | Memo (asOf) | Tracker | Delta | Threshold | Bucket |`,
    `| --- | ---: | ---: | ---: | ---: | --- |`,
    ...rows,
  ].join('\n');
}

function unmatchedSection(reconciled) {
  const memo = reconciled.unmatchedMemo;
  const actual = reconciled.unmatchedActual;
  if (!memo.length && !actual.length) {
    return `## Unmatched accounts\n\nEvery memo account paired with a tracker account, and every tracker account is in the memo. ✓`;
  }
  const lines = [`## Unmatched accounts`, ``];
  if (memo.length) {
    lines.push(`**In memo, not seen in tracker** (${memo.length}):`);
    lines.push('');
    for (const n of memo) lines.push(`- ${n}`);
    lines.push('');
  }
  if (actual.length) {
    lines.push(`**In tracker, not in memo** (${actual.length}):`);
    lines.push('');
    for (const n of actual) lines.push(`- ${n}`);
  }
  return lines.join('\n').trimEnd();
}

function sanitySection(reconciled) {
  const s = reconciled.sanityChecks;
  if (!s) {
    return `## Sanity checks\n\n_(Actual not consulted this run.)_`;
  }
  const lines = [`## Sanity checks`, ``];

  lines.push(`- Unmarked transfers: **${s.unmarkedTransfers}**`);
  if (s.unmarkedTransfers > 0) {
    lines.push(
      `  - These corrupt category sums if not marked. Mark them in Actual before trusting spending drift.`,
    );
  }

  lines.push(`- Uncategorized transactions: **${s.uncategorized}**`);
  if (s.uncategorized > 0) {
    lines.push(
      `  - Categorize these in Actual; uncategorized rows fall out of all category rollups.`,
    );
  }

  lines.push(`- Stale account syncs (>7d): **${s.staleAccounts.length}**`);
  for (const a of s.staleAccounts) {
    lines.push(`  - ${a.name}: last reconciled ${fmtDate(a.lastReconciledAt)} (${a.ageDays}d ago)`);
  }
  return lines.join('\n');
}

function skippedSection(opts) {
  const skipped = opts.skipped || [];
  if (!skipped.length) return null;
  const lines = [
    `## Skipped accounts`,
    '',
    `These reconciled accounts were not emitted to plan.json:`,
    '',
  ];
  for (const s of skipped) {
    lines.push(`- **${s.displayName || s.externalId}** — ${s.reason}`);
  }
  return lines.join('\n');
}

function metaHeader(reconciled, opts) {
  const generatedAt = opts.now ? opts.now.toISOString() : new Date().toISOString();
  const memo = opts.memoSha || reconciled._sources?.memo || null;
  const tracker = opts.trackerFetchedAt || reconciled._sources?.actual || null;
  const lines = [`# Drift Report`, ``, `_Generated ${generatedAt}_`];
  if (memo) lines.push(`_Memo SHA: \`${memo.slice(0, 16)}…\`_`);
  if (tracker) lines.push(`_Tracker fetched at: ${tracker}_`);
  else lines.push(`_Tracker: not consulted this run_`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Top-level entrypoint
// ---------------------------------------------------------------------------

/**
 * Build the drift report markdown.
 *
 * @param {object} reconciled - output of reconcile() (and emit if skipped exists)
 * @param {object} [opts]
 * @param {Date}   [opts.now]                - timestamp for header
 * @param {string} [opts.memoSha]            - override sourceSha for header
 * @param {string} [opts.trackerFetchedAt]
 * @param {Array}  [opts.skipped]            - from emit() return value
 * @returns {string}
 */
export function buildDriftReport(reconciled, opts = {}) {
  if (!reconciled || !Array.isArray(reconciled.accounts)) {
    throw new Error('buildDriftReport() requires reconciled output with accounts[]');
  }

  const sections = [
    metaHeader(reconciled, opts),
    headline(reconciled, opts),
    accountDriftSection(reconciled),
    unmatchedSection(reconciled),
    sanitySection(reconciled),
  ];
  const skipped = skippedSection(opts);
  if (skipped) sections.push(skipped);

  return sections.join('\n\n') + '\n';
}
