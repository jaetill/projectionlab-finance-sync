/**
 * Manual source — static entries for accounts not in any live tracker.
 *
 * Scope (PR-A — scaffold): exported function signatures only.
 * Real entries land as the buildout progresses (real estate values from Zillow,
 * Heidi's 403b balance once carrier is known, etc.).
 *
 * Most accounts now sync through Actual (PR-C source) — this module is for the
 * residual: things SimpleFIN can't reach or shouldn't reach. Examples expected
 * (subject to change as Phase 2 manual-accounts work continues):
 *
 *   - 33 Biscayne (home value, quarterly Zillow estimate)
 *   - 45688 Waterloo Station (rental value, quarterly Zillow)
 *   - Heidi's Providence Academy 403b (until SimpleFIN carrier is confirmed)
 *   - VIP Vanguard VITPX (until linked)
 *   - Anything else that surfaces as a manual entry
 *
 * @typedef {Object} ManualEntry
 * @property {string} id           stable UUID matching plan.json
 * @property {string} name
 * @property {string} type         "asset" | "liability" | "investment" | etc.
 * @property {number} balance      USD, positive
 * @property {string} updatedAt    ISO date the balance was last hand-updated
 * @property {string} notes        free-form context
 */

/**
 * Get the current set of manual entries.
 * @returns {Promise<ManualEntry[]>}
 */
export async function getManualEntries() {
  // PR-A scaffold: return empty until entries are added.
  return [];
}
