# Generator architecture

Phase 3 of the buildout. The generator turns the memo (`jason_finance.md`) and Actual Budget into a structurally-valid `plan.json` for the userscript to push to ProjectionLab. Pure functions over data; one CLI entrypoint; no persistent state.

## Topology

```
jason_finance.md  ───┐
                     │
Actual Budget        ├──► generator/ ──► data/plan.json
(localhost:5006)     │           │
                     │           └──► data/drift.md
manual.js entries ───┘
                                          │
                                          ▼
                                Tampermonkey userscript
                                          │
                                          ▼
                                  ProjectionLab
```

## Module map

| Module                                  | Role                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `generator/src/cli.js`                  | Argv parsing + subcommand dispatch. Wires the pipeline end-to-end.                                      |
| `generator/src/sources/memo.js`         | Parse `jason_finance.md` targeted tables → MemoSnapshot. Inline `[key:value]` tags carry metadata.      |
| `generator/src/sources/actual.js`       | Fetch accounts + 90d category spend from Actual via `@actual-app/api`. Dependency-injectable for tests. |
| `generator/src/sources/manual.js`       | Static fallback for accounts not in memo or tracker (TSP/VIP-style holdouts). Currently empty.          |
| `generator/src/scenarios.js`            | Parse `## Scenarios` section + compose one PL plan per scenario. v1 supports 3 levers.                  |
| `generator/src/reconcile.js`            | Pure function — memo + actual + manual + rules → abstract account view + drift + provenance.            |
| `generator/src/emit.js`                 | Merge reconciled view into a PL-shaped plan.json; validate; write or stdout.                            |
| `generator/src/drift-report.js`         | Build human-readable markdown from reconciled output + emit side effects.                               |
| `generator/config/reconcile-rules.json` | Drift thresholds + source priorities + account mapping overrides. Read at runtime.                      |

## Data flow per `generate` run

```
1. parseMemo(memoPath)
   → { accounts, income, scenarios, milestones, sourceSha }

2. fetchActualSnapshot(env)        [skipped if env not configured]
   → { accounts, categorySpend90d, sanityChecks, fetchedAt }

3. getManualEntries()              [returns [] today]

4. reconcile({ memo, actual, manual, rules })
   → { accounts, drift, provenance, unmatchedMemo, unmatchedActual,
       sanityChecks, scenarios }

5. emit(reconciled, { basePath?, dryRun? })
   → { written, path, warnings, skipped }
      - composes plans[] via composeScenarioPlans() if scenarios present
      - merges into base plan.json (preserves PL ids, demographics, variables)
      - validatePlan() runs before write

6. buildDriftReport(reconciled, { skipped })
   → markdown string written to data/drift.md or stderr
```

## Field-ownership matrix (the integration's heart)

| Field                        | Source of truth | Verification         | Drift policy                               |
| ---------------------------- | --------------- | -------------------- | ------------------------------------------ |
| Balance — Actual-linked acct | Actual          | —                    | Live wins; drift threshold per class.      |
| Balance — memo-only acct     | Memo            | —                    | Memo wins; staleness logged if >30d.       |
| Account name / type / owner  | Memo            | Actual               | Memo wins; tracker fills nulls.            |
| Growth assumption / splits   | Memo            | —                    | Memo only.                                 |
| FERS pension monthly         | Memo            | Actual (post-retire) | Memo wins; Actual interim payments tagged. |
| Veros offer terms            | Memo            | —                    | Memo only.                                 |
| Lifestyle spending target    | Memo            | Actual (90d avg)     | Drift-report only; no auto-overwrite.      |
| Milestones / scenarios       | Memo            | —                    | Memo only.                                 |
| PL entity UUID               | ProjectionLab   | —                    | Preserved across runs via base plan merge. |

Full design in [`integration-design.md`](https://github.com/jaetill/projectionlab-finance-sync) (workspace doc, not in repo).

## Scenarios

The memo's `## Scenarios` section declares N persistent scenarios. Each gets materialized as one PL plan via `composeScenarioPlans()`. Levers are sparse patches over a base case.

### v1 levers (PR-K)

| Lever                   | Syntax                                                            | Effect                                                                    |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `effective`             | `effective: 2027-01-01`                                           | Metadata; reserved for date-conditional logic in later levers.            |
| `lifestyle-target`      | `lifestyle-target: $12,000/mo` (or `$144,000/yr`)                 | Sets the `Lifestyle` expense event amount on the composed plan.           |
| `retirement-date.jason` | `retirement-date.jason: 2030-05-01`                               | Shifts the `Jason's Retirement` milestone (or matches "Your Retirement"). |
| `retirement-date.heidi` | `retirement-date.heidi: 2030-06-01`                               | Same for Heidi's milestone.                                               |
| `one-time-event`        | `one-time-event: +$1,000,000 to vanguard-brokerage on 2030-01-01` | Adds an account event (windfall or expense) at the named account/date.    |

### Deferred levers (PR-K2+)

- `housing-event` — compound (sell + buy + state-tax change)
- `state-tax-rate` — overrides plan.variables.localIncomeTaxRate
- `account-balance-override` — direct set on a specific account
- `income-event` — start/end/change a recurring income stream

Unknown lever names hard-fail at parse time. Adding a new lever takes 4 small steps: add to `KNOWN_LEVERS`, add to `parseScenarios()`, handle in `composeScenario()`, add tests.

## Inline tag convention

Notes-column tags carry metadata that doesn't have its own column:

```
| TSP (L2035/L2040 50/50) | $1,013,237 (12/31/2025) | Traditional $487,766 / Roth $190,836 [type:401k] [growth:0.07] [owner:jason] |
```

Tags are case-insensitive, can appear anywhere in the Notes cell, and the surrounding prose is preserved verbatim. Supported tag keys: `type`, `status`, `growth`, `uuid`, `owner`.

## Smoke testing discipline

Tests must never write to `data/plan.json` (it's the userscript's live payload to PL, not a build artifact). Use `mkdtemp` or `/tmp/...` paths in all tests, including bash smoke tests. The `--dry-run` flag prints to stdout instead of writing. See [`feedback_plan_json_is_live_data.md`](https://github.com/jaetill/projectionlab-finance-sync) memory for the recovery story.

## Future phases

- **Phase 4 (MCP server):** wraps the generator in MCP tools so Claude can run `generate_plan`, `get_drift`, and ephemeral what-if overrides without leaving chat. Scaffolded by PR-J (mcp-server/).
- **PR-I memo migration:** Account Registry + Spending Targets sections replace value-bearing Assets / Spending in the memo. Parser supports both old + new during the transition.
- **PR-K2+ lever expansion:** compound levers (housing-event, state-tax) that need >1 plan-section patch per scenario.
