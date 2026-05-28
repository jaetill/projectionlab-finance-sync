# `generator/` — memo + tracker → `plan.json`

## Status

**Active build, Phase 3 of the buildout plan.** PR-A (this directory) is the scaffold — directory layout, CLI skeleton, stubs, config file. No real functionality yet.

## What this is

A Node CLI that produces `data/plan.json` by reconciling two sources:

1. **The private finance memo** (`jason_finance.md`, never inside this repo — passed as a CLI flag from its real location on disk). Targeted markdown table parsing only; prose is for humans.
2. **The live tracker** (currently Actual Budget on `localhost:5006` via `@actual-app/api`). Source-of-truth for balances on accounts it sees.

Output:

- `data/plan.json` — consumed by the userscript and pushed into ProjectionLab. The shape matches `data/plan.example.json`.
- `_drift` keys — per-account deltas between memo and tracker beyond configured thresholds. Audit info, not a blocker.
- `_provenance` keys — which field came from which source. Audit info.

## Architecture

Tracker-agnostic: swap `src/sources/actual.js` for another tracker source and the rest of the pipeline stays the same. See `projectionlab-finance-sync-spec-v2.md` in the Financial Decisions workspace for the reconciliation rules and rationale.

```
generator/
├── README.md                    ← this file
├── config/
│   └── reconcile-rules.json     ← drift thresholds + source priorities + account mapping
├── src/
│   ├── cli.js                   ← entrypoint: node generator/src/cli.js {generate|drift|check}
│   ├── sources/
│   │   ├── memo.js              ← parse jason_finance.md (targeted tables only)
│   │   ├── actual.js            ← Actual Budget HTTP API balance fetch
│   │   └── manual.js            ← static entries for accounts not in any tracker
│   ├── reconcile.js             ← pure function: memo + sources → reconciled plan + drift
│   └── emit.js                  ← validate + write plan.json + report
└── tests/
    ├── cli.test.js
    ├── reconcile.test.js
    ├── memo-parse.test.js
    └── fixtures/
        ├── memo.sample.md       ← sanitized example memo
        └── actual.sample.json   ← sanitized example Actual response
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

## Build sequence (current PR is A)

| PR    | Scope                                                                                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | This scaffold — directories, README, CLI skeleton, config, stub modules, placeholder tests. **No real functionality.** Lint + tests pass. |
| B     | Memo source — parse the Assets table fixture-tested                                                                                       |
| C     | Actual source — auth, account listing, balance fetch via `@actual-app/api`                                                                |
| D     | Reconcile — pure function, rules table from config                                                                                        |
| E     | Emit — validator integration, drift, provenance, `--dry-run`                                                                              |
| F     | Drift thresholds + polish + better error messages                                                                                         |
| G     | Runbook docs at `docs/runbooks/generate.md`                                                                                               |
