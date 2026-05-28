# Account identity

ProjectionLab identifies every entity (account, milestone, income event, expense event, asset) by an opaque UUID assigned when the entity is first created in PL. The userscript treats those UUIDs as the source of truth.

## How it works

1. **First-time bootstrap.** Open `pl-export.json` (produced by `pl.exportData()`) and copy the entity UUIDs you care about into your private financial memo. Generate `plan.json` once per memo update; the UUIDs flow through unchanged.
2. **Every subsequent sync.** `plan.json` carries the same UUIDs the userscript pushed last time. `restoreCurrentFinances` and `restorePlans` replace the matching entities by id.
3. **Adding a new entity.** Give it a new UUID (any unique string PL hasn't seen before — `crypto.randomUUID()` or just `acct-<descriptive-slug>-<n>`). PL creates it.
4. **Removing an entity.** Leave it out of `plan.json`. The wholesale restore drops anything not in the payload.

## What we explicitly do NOT do

- **No name-based resolution.** Earlier scaffolds tried exact/fuzzy/substring matching on account names. That was for a fictional API surface (`getAccounts` / `setAccount`) that doesn't exist. The real API is UUID-native end to end.
- **No `accountMap` storage.** Nothing to override — there's no name → id map to maintain.
- **No partial updates.** `updateAccount` exists on the API but we don't call it. The architecture is "validate → snapshot → wholesale restore", documented in [`pl-api-cheatsheet.md`](pl-api-cheatsheet.md).

## What this means for renaming

Rename an account in PL → its UUID is unchanged → next sync still finds it. The user-visible name in PL comes from `plan.json`, so the next sync may overwrite a manually-renamed account back to whatever the memo says. That's intentional: `plan.json` is the source of truth.

## What this means for moving between plans

`restorePlans` takes a `Plan[]`. Every plan keeps its own milestones / income events / expense events with their own UUIDs. To move an entity from one plan to another, change which `plan.plans[*]` it lives in — its UUID stays the same.
