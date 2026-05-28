#!/usr/bin/env node
/**
 * generator CLI entrypoint.
 *
 * Usage:
 *   node generator/src/cli.js generate --memo /path/to/jason_finance.md [--dry-run]
 *   node generator/src/cli.js drift    --memo /path/to/jason_finance.md
 *   node generator/src/cli.js check    --memo /path/to/jason_finance.md
 *
 * Scope (PR-A — scaffold): argv parsing + subcommand dispatch only.
 * Subcommand handlers are stubs that print "not implemented yet" and exit 0.
 * Real implementations land in subsequent PRs (memo source = PR-B,
 * Actual source = PR-C, reconcile = PR-D, emit = PR-E, polish = PR-F).
 */

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const HELP = `\
projectionlab-finance-sync generator

Usage: node generator/src/cli.js <command> [options]

Commands:
  generate    Build data/plan.json from memo + tracker sources
  drift       Read-only drift report (no writes, no mutations)
  check       Validate memo parsing + tracker auth, no output

Options:
  --memo <path>    Path to the finance memo (required for all commands)
  --dry-run        For 'generate': show what would be written, don't write
  --help, -h       Show this help
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
  // First positional is the subcommand.
  const command = argv[0];
  if (!command || command === '--help' || command === '-h') {
    printHelpAndExit(0);
  }
  if (!['generate', 'drift', 'check'].includes(command)) {
    fail(`unknown command: ${command}\n${HELP}`);
  }

  const { values } = parseArgs({
    args: argv.slice(1),
    options: {
      memo: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) printHelpAndExit(0);

  if (!values.memo) {
    fail('--memo <path> is required');
  }
  const memoPath = resolve(values.memo);
  if (!existsSync(memoPath)) {
    fail(`memo not found at: ${memoPath}`);
  }

  return { command, memoPath, dryRun: values['dry-run'] };
}

// Subcommand stubs — PR-A scope. Real implementations in later PRs.

async function cmdGenerate({ memoPath, dryRun }) {
  process.stdout.write(
    `[generate] PR-A scaffold — not implemented yet.\n` +
      `  memo:    ${memoPath}\n` +
      `  dry-run: ${dryRun}\n`,
  );
}

async function cmdDrift({ memoPath }) {
  process.stdout.write(`[drift] PR-A scaffold — not implemented yet.\n  memo: ${memoPath}\n`);
}

async function cmdCheck({ memoPath }) {
  process.stdout.write(`[check] PR-A scaffold — not implemented yet.\n  memo: ${memoPath}\n`);
}

const HANDLERS = {
  generate: cmdGenerate,
  drift: cmdDrift,
  check: cmdCheck,
};

async function main() {
  const invocation = parseInvocation(process.argv.slice(2));
  await HANDLERS[invocation.command](invocation);
}

main().catch((err) => {
  process.stderr.write(`generator: ${err.message}\n`);
  if (process.env.DEBUG) {
    process.stderr.write(`${err.stack}\n`);
  }
  process.exit(1);
});
