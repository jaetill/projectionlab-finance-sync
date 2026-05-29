#!/usr/bin/env node
/**
 * generator CLI entrypoint.
 *
 * Usage:
 *   node generator/src/cli.js generate --memo /path/to/jason_finance.md [--dry-run]
 *   node generator/src/cli.js drift    --memo /path/to/jason_finance.md
 *   node generator/src/cli.js check    --memo /path/to/jason_finance.md
 *
 * Pipeline (generate):
 *   parseMemo -> fetchActualSnapshot (if env configured) -> reconcile -> emit
 *
 * Actual is optional. If ACTUAL_PASSWORD + ACTUAL_BUDGET_NAME are unset, the
 * generator runs memo-only — sensible for the first run or for offline use.
 */

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { parseMemo } from './sources/memo.js';
import { fetchActualSnapshot } from './sources/actual.js';
import { getManualEntries } from './sources/manual.js';
import { reconcile } from './reconcile.js';
import { emit } from './emit.js';

const HELP = `\
projectionlab-finance-sync generator

Usage: node generator/src/cli.js <command> [options]

Commands:
  generate    Build data/plan.json from memo + tracker sources
  drift       Read-only drift summary (no plan.json write)
  check       Validate memo parsing + tracker auth, no output

Options:
  --memo <path>    Path to the finance memo (required for all commands)
  --dry-run        For 'generate': print plan.json to stdout, don't write
  --base <path>    Optional override for the base plan.json to merge into
  --help, -h       Show this help

Env (Actual Budget — optional; memo-only mode if absent):
  ACTUAL_PASSWORD     Server password
  ACTUAL_BUDGET_NAME  Budget file to download
  ACTUAL_SERVER       Default http://localhost:5006
  ACTUAL_DATA_DIR     Default <tmp>/actual-cache
`;

function printHelpAndExit(code = 0) {
  process.stdout.write(HELP);
  process.exit(code);
}

function fail(msg) {
  process.stderr.write(`generator: ${msg}\n`);
  process.exit(1);
}

function parseInvocation(argv) {
  const command = argv[0];
  if (!command || command === '--help' || command === '-h') printHelpAndExit(0);
  if (!['generate', 'drift', 'check'].includes(command)) {
    fail(`unknown command: ${command}\n${HELP}`);
  }

  const { values } = parseArgs({
    args: argv.slice(1),
    options: {
      memo: { type: 'string' },
      base: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) printHelpAndExit(0);
  if (!values.memo) fail('--memo <path> is required');
  const memoPath = resolve(values.memo);
  if (!existsSync(memoPath)) fail(`memo not found at: ${memoPath}`);

  return {
    command,
    memoPath,
    basePath: values.base ? resolve(values.base) : null,
    dryRun: values['dry-run'],
  };
}

async function loadRules() {
  const rulesPath = resolve(import.meta.dirname, '..', 'config', 'reconcile-rules.json');
  return JSON.parse(await readFile(rulesPath, 'utf8'));
}

function actualConfigured(env = process.env) {
  return !!(env.ACTUAL_PASSWORD && env.ACTUAL_BUDGET_NAME);
}

async function runPipeline({ memoPath, basePath, dryRun, includeEmit }) {
  const rules = await loadRules();
  const memo = await parseMemo(memoPath);
  const actual = actualConfigured() ? await fetchActualSnapshot() : null;
  const manual = await getManualEntries();
  const reconciled = reconcile({ memo, actual, manual, rules });
  reconciled._sources = {
    memo: memo.sourceSha,
    actual: actual?.fetchedAt || null,
  };

  if (!includeEmit) {
    return { memo, actual, reconciled, emitResult: null };
  }

  const emitResult = await emit(reconciled, { basePath, dryRun });
  return { memo, actual, reconciled, emitResult };
}

async function cmdGenerate({ memoPath, basePath, dryRun }) {
  const { reconciled, emitResult } = await runPipeline({
    memoPath,
    basePath,
    dryRun,
    includeEmit: true,
  });
  if (emitResult.written) {
    process.stderr.write(
      `[generate] wrote ${emitResult.path}\n` +
        `  accounts: ${reconciled.accounts.length}\n` +
        `  drift:    ${reconciled.drift.length}\n` +
        `  warnings: ${emitResult.warnings.length}\n`,
    );
  }
}

async function cmdDrift({ memoPath }) {
  const { reconciled } = await runPipeline({ memoPath, includeEmit: false });
  process.stdout.write(
    `drift entries:      ${reconciled.drift.length}\n` +
      `unmatched memo:     ${reconciled.unmatchedMemo.length}\n` +
      `unmatched tracker:  ${reconciled.unmatchedActual.length}\n`,
  );
  if (reconciled.sanityChecks) {
    const s = reconciled.sanityChecks;
    process.stdout.write(
      `sanity:\n` +
        `  unmarked transfers: ${s.unmarkedTransfers}\n` +
        `  uncategorized:      ${s.uncategorized}\n` +
        `  stale accounts:     ${s.staleAccounts.length}\n`,
    );
  }
}

async function cmdCheck({ memoPath }) {
  const memo = await parseMemo(memoPath);
  process.stdout.write(
    `memo OK: ${memo.accounts.length} accounts, ${memo.income.length} income streams\n`,
  );
  if (actualConfigured()) {
    try {
      await fetchActualSnapshot();
      process.stdout.write('actual: connected ok\n');
    } catch (e) {
      process.stdout.write(`actual: FAILED — ${e.message}\n`);
      process.exit(1);
    }
  } else {
    process.stdout.write('actual: not configured (ACTUAL_PASSWORD + ACTUAL_BUDGET_NAME unset)\n');
  }
}

const HANDLERS = {
  generate: cmdGenerate,
  drift: cmdDrift,
  check: cmdCheck,
};

async function main() {
  const inv = parseInvocation(process.argv.slice(2));
  await HANDLERS[inv.command](inv);
}

main().catch((err) => {
  process.stderr.write(`generator: ${err.message}\n`);
  if (process.env.DEBUG) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
