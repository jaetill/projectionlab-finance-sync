# Generate `plan.json` from `jason_finance.md` via the generator

## When to use this

- Your memo (`jason_finance.md`) changed (accounts updated, new scenario added, etc.).
- You want the projection in ProjectionLab refreshed.
- You want a drift report comparing memo vs. Actual Budget without pushing to PL.

This replaces the older Claude-driven [`plan-regeneration.md`](plan-regeneration.md) flow — that's still valid, but the generator is the canonical path now.

## Prerequisites

- Node 22+ (check: `node --version`).
- The `@actual-app/api` runtime dep installed (`npm install`).
- Your memo at a known path (this guide uses `E:\Users\tille\Documents\Claude\Projects\Financial Decisions and Planning\jason_finance.md`).
- (Optional) An Actual Budget server reachable on `http://localhost:5006`. The generator runs memo-only when Actual isn't configured.

## The three subcommands

```
npm run generate -- --memo "<path-to-memo>"   # writes data/plan.json + data/drift.md
npm run drift    -- --memo "<path-to-memo>"   # writes data/drift.md only
npm run check    -- --memo "<path-to-memo>"   # validates memo parsing + Actual auth, no writes
```

Flags:

| Flag            | Effect                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `--memo <path>` | Required for all subcommands. Absolute path to the memo file.                                                        |
| `--base <path>` | Override the base plan to merge into. Defaults to `data/plan.json` (real), then `data/plan.example.json` (fallback). |
| `--dry-run`     | For `generate`: print plan.json to stdout, send drift to stderr, write nothing.                                      |
| `--stdout`      | For `drift`: print drift.md to stdout instead of writing `data/drift.md`.                                            |

## Environment for Actual Budget (optional)

```powershell
$env:ACTUAL_PASSWORD    = "<server password>"
$env:ACTUAL_BUDGET_NAME = "Tilley Household"   # whichever name you used at first-time setup
$env:ACTUAL_SERVER      = "http://localhost:5006"   # default
```

When `ACTUAL_PASSWORD` and `ACTUAL_BUDGET_NAME` are both set, the generator calls `@actual-app/api`, pulls 90 days of transactions, and reconciles. When either is missing, it runs memo-only — sensible for first runs.

## Standard workflow

```powershell
cd "E:\Users\tille\Documents\Source Code\projectionlab-finance-sync"

# 1) Dry-run first to see what would change
npm run generate -- --memo "E:\…\jason_finance.md" --dry-run

# 2) Real run (writes data/plan.json + data/drift.md)
npm run generate -- --memo "E:\…\jason_finance.md"

# 3) Review the drift report — this is the human signal
notepad data\drift.md

# 4) Open ProjectionLab in the browser, Tampermonkey → Sync now
```

## Reading the drift report

Sections, in order:

1. **Headline** — counts at a glance (drift entries, unmatched, sanity-check signals).
2. **Account drift** — memo balance vs. Actual balance, sorted by absolute delta. Threshold per account class (checking $100, savings $500, investment $0 = always log).
3. **Unmatched accounts** — memo accounts not paired with anything in Actual, and vice versa.
4. **Sanity checks** — unmarked transfers, uncategorized transactions, accounts not synced for >7 days. Each is one actionable item.
5. **Skipped accounts** — reconciled accounts the generator dropped (e.g., loyalty points with no $ balance).

If `unmarkedTransfers > 0` or `uncategorized > 0`, fix those in Actual before trusting the category rollups.

## When a generator run fails

| Symptom                                        | Cause + fix                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `memo Assets table missing required columns`   | Memo's `## Assets` table headers drifted from `Account / Balance / Notes`. Fix the table header.                                                             |
| `scenarios: unknown lever "..."`               | Typo in a `## Scenarios` lever name. Known levers: `effective`, `lifestyle-target`, `retirement-date.jason`, `retirement-date.heidi`, `one-time-event`.      |
| `ACTUAL_PASSWORD env var is required`          | You partially set Actual env vars. Either set both `ACTUAL_PASSWORD` + `ACTUAL_BUDGET_NAME`, or unset both for memo-only mode.                               |
| `budget "<name>" not found on Actual server`   | `ACTUAL_BUDGET_NAME` doesn't match a budget on the server. Run `npm run check` to list available budgets.                                                    |
| `emit: plan validation failed (N errors): ...` | The reconciled view produced a structurally bad plan.json. The error names the offending field. Usually a memo-side issue (missing balance, wrong type tag). |

## Adding scenarios to the memo

Add a `## Scenarios` section to the memo. Each scenario is a `### name` block followed by one-line levers:

```markdown
## Scenarios

### current-path

The current path. No overrides.

### inherit-1m

- effective: 2030-01-01
- one-time-event: +$1,000,000 to vanguard-brokerage on 2030-01-01

### lifestyle-12k

- effective: 2026-08-01
- lifestyle-target: $12,000/mo
- retirement-date.jason: 2026-07-31
```

Unknown lever names hard-fail at parse time — typos surface immediately. See `docs/architecture/generator.md` for the lever reference.

## Don'ts

- Don't smoke-test against `data/plan.json` — that's your live payload to PL. Use `--dry-run` or `--base /tmp/something.json` with an `--out` override (or read the source if you're modifying behavior). See [feedback_plan_json_is_live_data](https://github.com/jaetill/projectionlab-finance-sync) for the recovery story.
- Don't pass `--base data/plan.example.json` for a real run unless you mean to reset to Acme defaults. The example file is a schema reference, not a base for your real plan.
- Don't commit `data/plan.json` or `data/drift.md` — both are gitignored on purpose. The three-layer guard (gitignore + gitleaks + `block-plan-json` pre-commit hook) will block you anyway.
