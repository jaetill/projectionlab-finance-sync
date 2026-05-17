# `extract/` — deferred memo-to-plan extractor

## Status

**Deferred.** This directory holds the _interface_ for a future `memo_to_plan.py` script that will parse `finance-memo.md` directly and emit `plan.json`. Until that lands, Claude regenerates `plan.json` interactively per [`../docs/runbooks/plan-regeneration.md`](../docs/runbooks/plan-regeneration.md).

## Why deferred

Two reasons:

1. **Schema stability.** `plan.json`'s schema (v1, in [`../data/plan.example.json`](../data/plan.example.json)) is still settling. Writing a parser before the schema locks would mean reworking the parser on every schema change. Claude can adapt on the fly; a Python script can't.
2. **80/20.** Jason regenerates `plan.json` a handful of times a year (when balances move enough to matter). Saving five minutes per regeneration doesn't justify writing + maintaining a parser yet.

## Planned interface

When implemented, the script will:

```sh
python extract/memo_to_plan.py path/to/finance-memo.md > plan.json
```

| Aspect          | Plan                                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Input           | Path to `finance-memo.md` (anywhere on disk; never inside this repo)                                                                            |
| Output          | `plan.json` to stdout (or `--out path` flag)                                                                                                    |
| Schema target   | The current `schemaVersion` from `../data/plan.example.json`                                                                                    |
| Memo format     | Markdown with conventional section headers (e.g., `## Accounts`, `## Income`, `## Milestones`); table rows or YAML front-matter blocks per item |
| Validation      | Run the same validator as the userscript before emitting — non-zero exit on invalid output                                                      |
| Dependencies    | Python 3.10+, stdlib only (no third-party parsing libs — keep the surface minimal)                                                              |
| Secret handling | Stream input → stdout; never write the memo or `plan.json` to any cache or temp file                                                            |

## What would make this worth building

- Schema is stable (no changes for two consecutive releases).
- Regeneration cadence exceeds ~once a month.
- Someone other than Jason needs to run it (without Claude in the loop).

## What this directory contains today

Only this README.
