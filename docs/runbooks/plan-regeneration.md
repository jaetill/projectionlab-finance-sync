# Regenerate `plan.json` from `finance-memo.md`

## When to use this

- Your `finance-memo.md` memo changed (you opened a new account, took on a new expense, updated balances, etc.)
- You want to re-sync ProjectionLab with current numbers
- You changed the `plan.json` schema (bumped `schemaVersion`) and need to regenerate to match

## Where things live

- **`finance-memo.md`** — your private memo. Lives outside this repo (in your personal notes / 1Password / wherever you keep it). NEVER in this Git repo.
- **`data/plan.example.json`** — the schema reference, committed. Sanitized, all fake values.
- **`plan.json`** — the real one. Gitignored. You paste it into Tampermonkey via the userscript menu; it's never written to a repo file.

## Steps (Claude-driven, current)

The `extract/memo_to_plan.py` script is deferred. For now, Claude regenerates `plan.json` interactively:

1. Open a Claude session with access to your `finance-memo.md` (e.g., paste the memo contents, or have Claude read it from a local path you allow).
2. Show Claude `data/plan.example.json` so the output matches the schema.
3. Ask: _"Regenerate plan.json from this memo, matching the schema in data/plan.example.json. Output as a single JSON code block."_
4. Copy Claude's output JSON to your clipboard.
5. In ProjectionLab: Tampermonkey icon → ProjectionLab Finance Sync → **Set plan.json** → paste. The userscript's validator will reject malformed input — fix and retry.
6. Same menu → **Sync now**.

## Verification

- The **Set plan.json** menu either accepts (status panel updates `plan: set ✅`) or rejects with a validation error you can read.
- **Sync now** reports counts matching what you'd expect from the memo (e.g., "synced 4 accounts, 2 income streams, 1 milestone").

## Future: `extract/memo_to_plan.py`

When ready, a small Python script will parse `finance-memo.md` directly and emit `plan.json` — eliminating the Claude session step. Interface is documented in [`extract/README.md`](https://github.com/jaetill/projectionlab-finance-sync/blob/main/extract/README.md). Until then, Claude-driven regeneration is the supported path.

## Rollback

There's nothing to roll back — generating a new `plan.json` doesn't touch PL until you click **Sync now**. If the new sync produces wrong data in PL, see [`install.md` → Rollback](install.md#rollback).
