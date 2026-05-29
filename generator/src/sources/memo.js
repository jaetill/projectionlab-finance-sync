/**
 * Memo source — parses jason_finance.md to extract structured financial data.
 *
 * Targeted parsing: reads specific markdown TABLES only. The surrounding prose
 * is for humans and AI advisors and is intentionally left alone.
 *
 * Sections currently parsed:
 *   - "## Assets"                  -> accounts[]
 *   - "## Income Picture (Monthly)" -> income[]
 *
 * Memo conventions the parser expects:
 *   - Assets table columns: Account | Balance | Notes
 *   - Income table columns: Source | Amount | Notes
 *   - Bold rows (cells starting with `**`) are summary rows and are skipped
 *   - Optional inline tags in the Notes column: [key:value] — extracted into
 *     structured metadata (type, status, growth, uuid, owner). Tags are
 *     case-insensitive and may appear anywhere in the Notes cell. Tag
 *     extraction does not destroy the rest of the prose.
 *   - Account names may include a trailing "— ACCT123" identifier suffix;
 *     the parser extracts it as `accountNumber` and keeps the cleaned name
 *     as `displayName`.
 *   - Balance values may be plain ($1,234.56), suffixed ($738k), bracketed
 *     with a date ($1,013,237 (12/31/2025)), or prose-y (Est. value ~$700k).
 *     The first numeric value wins as `balance`; the raw string is preserved
 *     in `balanceRaw` for audit.
 *
 * Failure mode:
 *   - If required columns are missing or the section isn't found, throw with
 *     a helpful message. Jason edits the memo; he should know immediately if
 *     the parser drifted from the table format.
 */

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { parseScenarios } from '../scenarios.js';

// ---------------------------------------------------------------------------
// Helpers (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Extract `[key:value]` inline tags from a string. Returns the tag map plus
 * the original string with tags removed and whitespace collapsed.
 *
 * Tag keys are lower-cased. Values are trimmed but otherwise verbatim.
 * Unmatched brackets are left alone.
 */
export function parseInlineTags(text) {
  if (!text) return { tags: {}, prose: '' };
  const tags = {};
  const prose = text
    .replace(/\[([a-z][a-z0-9-]*?)\s*:\s*([^\]]+?)\]/gi, (_, k, v) => {
      tags[k.toLowerCase()] = v.trim();
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { tags, prose };
}

/**
 * Parse a money-ish string. Returns the first numeric value found (handling
 * `$`, commas, `k`/`m` suffixes, optional `~`), plus an ISO `asOf` date if a
 * `(MM/DD/YYYY)` or `(YYYY-MM-DD)` appears anywhere in the string.
 *
 * Returns `{ amount: null, asOf: null }` when no number is found.
 */
export function parseMoney(text) {
  if (!text) return { amount: null, asOf: null };
  const cleaned = text.replace(/\*\*/g, '').trim();

  // Try date parsing first so we can mask the date out of the cleaned string
  // before money parsing (prevents "12/31/2025" leaking digits into the money
  // match).
  let asOf = null;
  let moneyHaystack = cleaned;
  const slashDate = cleaned.match(/\((\d{1,2})\/(\d{1,2})\/(\d{4})\)/);
  if (slashDate) {
    const [whole, m, d, y] = slashDate;
    asOf = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    moneyHaystack = cleaned.replace(whole, '');
  } else {
    const isoDate = cleaned.match(/\((\d{4}-\d{2}-\d{2})\)/);
    if (isoDate) {
      asOf = isoDate[1];
      moneyHaystack = cleaned.replace(isoDate[0], '');
    }
  }

  let amount = null;
  const moneyMatch = moneyHaystack.match(/~?\s*\$\s*([\d,]+(?:\.\d+)?)\s*([kKmM])?(?!\d)/);
  if (moneyMatch) {
    const raw = Number(moneyMatch[1].replace(/,/g, ''));
    if (Number.isFinite(raw)) {
      const suffix = (moneyMatch[2] || '').toLowerCase();
      amount = suffix === 'k' ? raw * 1_000 : suffix === 'm' ? raw * 1_000_000 : raw;
    }
  }

  return { amount, asOf };
}

/**
 * Opportunistic split parser. Recognizes patterns like
 * `Traditional $487,766 / Roth $190,836 / Agency $266,832 / Auto 1% $67,803`
 * and returns a map keyed by normalized label.
 *
 * Returns `null` when no split pattern is detected (the conservative gate is
 * "at least one ` / ` separator between a $amount and the next label+$amount").
 *
 * Labels are normalized: lower-cased, spaces -> underscores, `%` -> `pct`.
 */
export function parseSplits(notes) {
  if (!notes) return null;
  if (!/\$\d[\d,]*(?:\.\d+)?\s+\/\s+[A-Za-z]/.test(notes)) return null;

  const splits = {};
  const re = /([A-Za-z][A-Za-z0-9\s%]*?)\s*\$([\d,]+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(notes)) !== null) {
    const label = m[1].trim().toLowerCase().replace(/%/g, 'pct').replace(/\s+/g, '_');
    const amount = Number(m[2].replace(/,/g, ''));
    if (label && Number.isFinite(amount)) splits[label] = amount;
  }
  return Object.keys(splits).length > 0 ? splits : null;
}

/**
 * Split an "Account Name — ACCT123" cell into a display name and an account
 * number. The separator is an em-dash, en-dash, or hyphen. The trailing
 * identifier is matched against `[A-Z0-9-]{4,}` (case-insensitive), optionally
 * preceded by "Acct".
 */
export function splitDisplayName(account) {
  if (!account) return { displayName: '', accountNumber: null };
  const m = account.match(/^(.+?)\s*[—–-]\s*(?:Acct\s+)?([A-Z0-9-]{4,})\s*$/i);
  if (!m) return { displayName: account.trim(), accountNumber: null };
  return { displayName: m[1].trim(), accountNumber: m[2].trim() };
}

function parseRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/**
 * Find all markdown tables in a chunk of text. A table is a pipe-delimited
 * header line followed by a separator line (`|---|---|`) followed by zero or
 * more pipe-delimited rows.
 */
export function parseMarkdownTables(text) {
  const lines = text.split('\n');
  const tables = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.indexOf('|', 1) > -1) {
      const next = (lines[i + 1] || '').trim();
      if (/^\|[\s|:-]+\|$/.test(next) && /-/.test(next)) {
        const header = parseRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          rows.push(parseRow(lines[i]));
          i++;
        }
        tables.push({ header, rows });
        continue;
      }
    }
    i++;
  }
  return tables;
}

/**
 * Locate a `## Heading` section and return the first markdown table inside
 * it (everything up to the next `## ` heading). Returns null if the section
 * is absent.
 */
export function findSectionTable(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^##\\s+${escaped}\\s*$`, 'im');
  const m = re.exec(markdown);
  if (!m) return null;
  const start = m.index + m[0].length;
  const tail = markdown.slice(start);
  const nextHeading = tail.search(/\n##\s/);
  const section = nextHeading === -1 ? tail : tail.slice(0, nextHeading);
  const tables = parseMarkdownTables(section);
  return tables[0] || null;
}

// ---------------------------------------------------------------------------
// Section parsers
// ---------------------------------------------------------------------------

function indexOfHeader(headers, name) {
  return headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
}

/**
 * Parse the Assets table into MemoAccount[].
 * Bold summary rows (cells starting with `**`) are skipped.
 */
export function parseAccountsTable(table) {
  if (!table) return [];
  const accountCol = indexOfHeader(table.header, 'Account');
  const balanceCol = indexOfHeader(table.header, 'Balance');
  const notesCol = indexOfHeader(table.header, 'Notes');
  if (accountCol < 0 || balanceCol < 0) {
    throw new Error(
      `memo Assets table missing required columns ("Account" and/or "Balance"); got headers: ${table.header.join(' | ')}`,
    );
  }
  const accounts = [];
  for (const row of table.rows) {
    const accountCell = (row[accountCol] || '').trim();
    if (!accountCell || accountCell.startsWith('**')) continue;
    const balanceCell = row[balanceCol] || '';
    const notesCell = notesCol >= 0 ? row[notesCol] || '' : '';
    const { displayName, accountNumber } = splitDisplayName(accountCell);
    const { amount: balance, asOf } = parseMoney(balanceCell);
    const { tags, prose: notes } = parseInlineTags(notesCell);
    const splits = parseSplits(notesCell);
    accounts.push({
      displayName,
      accountNumber,
      balance,
      balanceRaw: balanceCell.trim(),
      asOf,
      type: tags.type || null,
      status: tags.status || null,
      growthAssumption:
        tags.growth !== undefined && tags.growth !== null ? Number(tags.growth) : null,
      uuid: tags.uuid || null,
      owner: tags.owner || null,
      splits,
      notes,
    });
  }
  return accounts;
}

/**
 * Parse the Income Picture (Monthly) table into MemoIncomeStream[].
 */
export function parseIncomeTable(table) {
  if (!table) return [];
  const sourceCol = indexOfHeader(table.header, 'Source');
  const amountCol = indexOfHeader(table.header, 'Amount');
  const notesCol = indexOfHeader(table.header, 'Notes');
  if (sourceCol < 0 || amountCol < 0) {
    throw new Error(
      `memo Income table missing required columns ("Source" and/or "Amount"); got headers: ${table.header.join(' | ')}`,
    );
  }
  const streams = [];
  for (const row of table.rows) {
    const sourceCell = (row[sourceCol] || '').trim();
    if (!sourceCell || sourceCell.startsWith('**')) continue;
    const amountCell = row[amountCol] || '';
    const notesCell = notesCol >= 0 ? row[notesCol] || '' : '';
    const { amount: monthly } = parseMoney(amountCell);
    const { tags, prose: notes } = parseInlineTags(notesCell);
    streams.push({
      source: sourceCell,
      monthly,
      monthlyRaw: amountCell.trim(),
      type: tags.type || null,
      notes,
    });
  }
  return streams;
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

/**
 * Parse the finance memo into a structured snapshot.
 * @param {string} memoPath - absolute path to jason_finance.md
 */
export async function parseMemo(memoPath) {
  const content = await readFile(memoPath, 'utf8');
  const sourceSha = createHash('sha256').update(content).digest('hex');
  const assetsTable = findSectionTable(content, 'Assets');
  const incomeTable = findSectionTable(content, 'Income Picture (Monthly)');
  const accounts = parseAccountsTable(assetsTable);
  const income = parseIncomeTable(incomeTable);
  const scenarios = parseScenarios(content);
  return {
    sourcePath: memoPath,
    sourceSha,
    accounts,
    income,
    milestones: [],
    scenarios,
  };
}
