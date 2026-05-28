/**
 * Emit — write the reconciled plan to data/plan.json (or stdout for --dry-run).
 *
 * Scope (PR-A — scaffold): exported function signatures only.
 * Real validation + write lands in PR-E.
 *
 * Behavior (per spec-v2 §"plan.json additions"):
 *
 *   - Run the existing userscript validator (userscript/src/plan-validator.js)
 *     against the reconciled output BEFORE writing. Non-zero exit on invalid.
 *   - Add _meta, _drift, _provenance keys. The userscript ignores unknown keys —
 *     verify that assumption holds before relying on it.
 *   - Write to data/plan.json (the gitignored + pre-commit-blocked path).
 *   - --dry-run: print to stdout instead, no write.
 *   - Never log balances to stderr/stdout outside of --dry-run mode. Real numbers
 *     stay in the file, which has the three-layer guard.
 *
 * @typedef {Object} EmitOptions
 * @property {boolean} dryRun
 * @property {string}  outPath   defaults to data/plan.json relative to repo root
 */

/**
 * Validate and write (or print) the reconciled plan.
 * @param {Object} reconciled - output of reconcile()
 * @param {EmitOptions} opts
 * @returns {Promise<{written: boolean, path: string|null}>}
 */
export async function emit(reconciled, opts) {
  throw new Error(`emit() not implemented yet (PR-E scope); opts.dryRun=${opts?.dryRun}`);
}
