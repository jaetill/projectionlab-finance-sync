/**
 * Memo source — parses jason_finance.md to extract structured financial data.
 *
 * Scope (PR-A — scaffold): exported function signatures only.
 * Real parsing lands in PR-B.
 *
 * Parsing rules (per buildout plan §4 Phase 3):
 * - Read targeted markdown TABLES only ("## Assets", "## Income Picture (Monthly)",
 *   "## Ally CD Details", "## Post-Retirement Income Projection").
 * - Leave the prose alone. It carries Speaker-for-the-Dead-style context the
 *   structured data can't, and is meant for humans + AI advisors.
 * - When unsure, fail loudly. Jason edits the memo; he'll want to know if the
 *   parser drifted from the table format.
 *
 * @typedef {Object} MemoSnapshot
 * @property {string} sourcePath
 * @property {string} sourceSha    SHA-256 of the file contents for provenance
 * @property {Array}  accounts     parsed from the Assets table
 * @property {Array}  income       parsed from Income Picture (Monthly)
 * @property {Array}  milestones   pulled from the prose narratives or dedicated tables
 */

/**
 * Parse the finance memo into a structured snapshot.
 * @param {string} memoPath - absolute path to jason_finance.md
 * @returns {Promise<MemoSnapshot>}
 */
export async function parseMemo(memoPath) {
  throw new Error(`memo.parseMemo() not implemented yet (PR-B scope); called with: ${memoPath}`);
}
