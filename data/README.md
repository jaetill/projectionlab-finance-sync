# `data/` — schema reference and runtime input

## Files

| File                | Committed?   | Purpose                                                                                                                                           |
| ------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan.example.json` | ✅ Yes       | Sanitized schema reference. All values are clearly fake (`"Acme"`, round numbers). This is the canonical shape for `plan.json`.                   |
| `plan.json`         | ❌ **NEVER** | Real financial data. Lives in the user's clipboard / Tampermonkey storage / private notes. Three guards stop it from being committed (see below). |
| `pl-export.json`    | ❌ **NEVER** | Output of a live `pl.exportData()` call — used as a structural reference and as the rollback baseline. Same protection as `plan.json`.            |

## Why `plan.json` and `pl-export.json` are not in this repo

They contain real account balances, milestones, income, expenses, and the live PL UUIDs that identify them. This repo is **public**. The data flow is:

```
finance-memo.md (private, lives in a separate workspace)
   └── Claude regenerates on demand ──→ plan.json (in your clipboard)
                                          └── pasted into Tampermonkey menu
                                                └── GM_setValue('plan', ...)
                                                      └── userscript reads it at sync time
```

`plan.json` never touches the repo, the public disk, or any service except ProjectionLab itself.

## Three guards against accidental commit

1. **`.gitignore` allowlist** — `data/*.json` is denied by default; `data/plan.example.json` is the only allowed exception. Anything new in `data/` is invisible to git unless explicitly allowlisted.
2. **Pre-commit hook `block-plan-json`** — defense in depth. Refuses any staged path matching `data/plan.json` or `data/pl-export.json` even if added with `git add -f`.
3. **`gitleaks`** — content-scans every commit for high-entropy strings and known secret patterns.

If you somehow get past all three, see [`../docs/runbooks/secret-leak.md`](../docs/runbooks/secret-leak.md).

## Schema (v2)

`plan.json` mirrors the shape that PL's `exportData()` returns, minus the user-owned `progress`/`settings`/`meta` keys. See `plan.example.json` for the canonical shape.

Top-level keys:

| Key     | Type                  | Required | Notes                                                                                                                                                                       |
| ------- | --------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_meta` | object                | optional | Our metadata (note, schemaVersion, generatedAt). PL ignores it; we use it for debug.                                                                                        |
| `today` | object                | yes      | Current finances: demographics, `savingsAccounts[]`, `investmentAccounts[]`, `debts[]`, `assets[]`. Pushed via `pl.restoreCurrentFinances`.                                 |
| `plans` | array of Plan objects | yes      | Each plan has `id`, `name`, `milestones[]`, `income.events[]`, `expenses.events[]`, `accounts.events[]`, `assets.events[]`, `variables`, etc. Pushed via `pl.restorePlans`. |

Identity for every entity (account, milestone, event) is a string `id`. The userscript copies ids through unchanged; PL replaces by id on wholesale restore. See [`../docs/account-mapping.md`](../docs/account-mapping.md).

The userscript's validator ([`../userscript/src/plan-validator.js`](../userscript/src/plan-validator.js)) enforces the structural shape and returns warnings for unknown account types or milestone criteria types — actual field-level validation is PL's job.

## Regenerating `plan.json`

See [`../docs/runbooks/plan-regeneration.md`](../docs/runbooks/plan-regeneration.md).
