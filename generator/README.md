# `generator/` — memo + tracker → `plan.json`

## Status

**Phase 3 DONE as of 2026-05-29.** End-to-end pipeline runs against the real `jason_finance.md`. Companion MCP server in `../mcp-server/` (PR-J scaffold). 290 tests across the suite.

## What this is

A Node CLI that produces `data/plan.json` by reconciling three sources:

1. **The private finance memo** (`jason_finance.md`, never inside this repo — passed as a CLI flag from its real location on disk). Targeted markdown table parsing only; prose is for humans. Supports new `## Account Registry` + `## Spending Targets` + `## Scenarios` sections alongside legacy `## Assets` + `## Income Picture` during migration.
2. **The live tracker** (Actual Budget on `localhost:5006` via `@actual-app/api`). Source-of-truth for balances on accounts it sees. Optional; generator runs memo-only when env not configured.
3. **Manual entries** (`src/sources/manual.js`) for accounts neither memo nor tracker can speak for. Currently empty.

Output:

- `data/plan.json` — consumed by the userscript and pushed into ProjectionLab. The shape matches `data/plan.example.json`. Wholesale-restore semantics: anything not in the file gets dropped from PL on next sync.
- `data/drift.md` — human-readable diff between memo and Actual; sanity-check signals; skipped accounts.
- `_meta`, `_drift`, `_provenance` keys on plan.json — audit info, ignored by PL.

## Architecture

See [`docs/architecture/generator.md`](../docs/architecture/generator.md) for the full module map, data flow, and field-ownership matrix. Quick tree:

```
generator/
├── README.md                    ← this file
├── config/
│   └── reconcile-rules.json     ← drift thresholds + source priorities + account mapping
├── src/
│   ├── cli.js                   ← entrypoint: node generator/src/cli.js {generate|drift|check}
│   ├── sources/
│   │   ├── memo.js              ← parse jason_finance.md (Assets+Registry, Income, Targets)
│   │   ├── actual.js            ← Actual Budget API: balances + 90d category spend
│   │   └── manual.js            ← static entries for accounts not in any tracker (empty today)
│   ├── scenarios.js             ← parse ## Scenarios + compose one PL plan per scenario
│   ├── reconcile.js             ← pure function: memo + sources + rules → reconciled + drift
│   ├── emit.js                  ← merge into PL plan.json + validate + write or stdout
│   └── drift-report.js          ← format reconciled output as markdown
└── tests/
    ├── cli.test.js              ← scaffold-level integration
    ├── memo-parse.test.js       ← 58 tests on memo parser
    ├── actual-fetch.test.js     ← 30 tests on Actual source
    ├── reconcile.test.js        ← 32 tests on reconcile
    ├── emit.test.js             ← 24 tests on emit
    ├── scenarios.test.js        ← 34 tests on scenarios
    ├── drift-report.test.js     ← 18 tests on drift report
    └── fixtures/
        ├── memo.sample.md       ← sanitized example memo
        └── actual.sample.json   ← sanitized example Actual API response (date placeholders)
```

## CLI surface

```sh
# Full run: memo + Actual → data/plan.json
npm run generate -- --memo /absolute/path/to/jason_finance.md

# Show what would be written without writing
npm run generate -- --memo /path --dry-run

# Read-only drift report (no writes, no API mutations)
npm run drift -- --memo /path

# Validate config + memo parsing + Actual auth, no output
npm run check -- --memo /path
```

## Important conventions

- **Memo path is always passed as a CLI flag.** Never copy the memo into this repo. Never read it from a default location. Explicit > implicit for files containing real numbers.
- **`data/plan.json` is gitignored + scanned + blocked by pre-commit hook.** The three-layer guard exists for a reason; this directory must not be the thing that breaks it.
- **Actual API password comes from `ACTUAL_PASSWORD` env var.** Never argv, never config file, never committed anywhere.
- **API gotchas worth knowing** (see also `reference_actual_api_gotchas` in the user-memory):
  - `downloadBudget(syncId, opts?)` is positional, not `{ syncId }`. Docs are wrong.
  - The "syncId" parameter is matched against the budget's `groupId` field on the server, NOT `cloudFileId`. Use `target.groupId` from `getBudgets()` output.

## Build sequence (DONE through PR-J as of 2026-05-29)

| PR  | Scope | Commit / status |
| --- | ----- | --------------- |
