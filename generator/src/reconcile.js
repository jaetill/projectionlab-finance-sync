/**
 * Reconcile — pure function that merges memo + tracker + manual sources into
 * a single coherent plan, applying per-field source priority and detecting drift.
 *
 * Scope (PR-A — scaffold): exported function signature only.
 * Real reconciliation logic lands in PR-D.
 *
 * Design (per spec-v2 §"Reconciliation rules"):
 *
 *   - Source priority is per-field (see config/reconcile-rules.json).
 *     Balance: tracker wins for accounts it sees; memo wins for accounts it doesn't.
 *     Names/types/owners/growth assumptions: memo wins (memo is the strategic doc).
 *     Milestones/income streams/expense streams: memo only (no tracker equivalent).
 *   - Drift is detected when memo and tracker disagree on a balance beyond the
 *     per-account-class threshold. Drift is logged, NOT a blocker.
 *   - Output is pure data; no side effects. Caller decides what to do with it.
 *
 * @typedef {Object} ReconcileInput
 * @property {Object} memo       MemoSnapshot (see sources/memo.js)
 * @property {Object} actual     ActualSnapshot or null (see sources/actual.js)
 * @property {Array}  manual     ManualEntry[] (see sources/manual.js)
 * @property {Object} rules      reconcile-rules.json content
 *
 * @typedef {Object} ReconcileOutput
 * @property {Object} today      reconciled "today" payload destined for plan.today
 * @property {Array}  plans      reconciled scenarios destined for plan.plans
 * @property {Array}  drift      [{ accountId, field, memoValue, trackerValue, delta }]
 * @property {Array}  provenance [{ field, source, sourceDetail }] for audit
 */

/**
 * Reconcile memo + tracker + manual into a single plan payload.
 * @param {ReconcileInput} input
 * @returns {ReconcileOutput}
 */
export function reconcile(input) {
  throw new Error(
    `reconcile() not implemented yet (PR-D scope); received input keys: ${Object.keys(input || {}).join(', ')}`,
  );
}
