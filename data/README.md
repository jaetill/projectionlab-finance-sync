# `data/` — schema reference and runtime input

## Files

| File                | Committed?   | Purpose                                                                                                                                                                                  |
| ------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan.example.json` | ✅ Yes       | Sanitized schema reference. All values are clearly fake (`"Acme"`, round numbers).                                                                                                       |
| `plan.json`         | ❌ **NEVER** | Real financial data. Lives in the user's clipboard / 1Password / private notes. Pasted into Tampermonkey via the userscript menu. Three guards stop it from being committed (see below). |

## Why `plan.json` is not in this repo

It contains real account balances, income, expenses, and milestones. This repo is **public**. The data flow is:

```
finance-memo.md (private)
   └── Claude regenerates on demand ──→ plan.json (in your clipboard)
                                          └── pasted into Tampermonkey menu
                                                └── GM_setValue('plan', ...)
                                                      └── userscript reads it at sync time
```

`plan.json` never touches the repo, the disk (outside of Tampermonkey storage), or any service except ProjectionLab.

## Three guards against accidental commit

1. **`.gitignore`** — `data/plan.json` is listed.
2. **Pre-commit hook `block-plan-json`** — refuses any staged path matching `data/plan.json` even if added with `git add -f`.
3. **`gitleaks`** — content-scans every commit for high-entropy strings and known secret patterns.

If you somehow get past all three, see [`../docs/runbooks/secret-leak.md`](../docs/runbooks/secret-leak.md).

## Schema (v1)

See `plan.example.json` for the canonical shape. Top-level keys:

| Key             | Type                       | Required            |
| --------------- | -------------------------- | ------------------- |
| `schemaVersion` | integer                    | yes (currently `1`) |
| `generatedAt`   | ISO-8601 UTC timestamp     | yes                 |
| `asOfDate`      | ISO date (YYYY-MM-DD)      | yes                 |
| `accounts[]`    | array of account objects   | yes                 |
| `income[]`      | array of income streams    | optional            |
| `expenses[]`    | array of expense streams   | optional            |
| `milestones[]`  | array of milestone objects | optional            |

`accounts[].type` and `milestones[].kind` use enum strings. The userscript's validator enforces presence; the userscript's account-mapping logic resolves friendly names to PL account IDs (see [`../docs/account-mapping.md`](../docs/account-mapping.md)).

## Regenerating `plan.json`

See [`../docs/runbooks/plan-regeneration.md`](../docs/runbooks/plan-regeneration.md).
