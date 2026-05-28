# ProjectionLab Plugin API cheatsheet

Reference for the `window.projectionlabPluginAPI` surface this userscript depends on. Confirmed against PL's official docs at <https://app.projectionlab.com/docs/types/PluginAPI.html>.

## Where the API lives

`unsafeWindow.projectionlabPluginAPI` — installed by the ProjectionLab app itself. Userscripts must use `unsafeWindow` (not `window`) because Tampermonkey wraps the page's `window` by default.

## Polling pattern

```js
async function waitForPluginAPI(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const api = unsafeWindow.projectionlabPluginAPI;
    if (api) return api;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('projectionlabPluginAPI did not load within timeout');
}
```

## The full method surface (7 methods)

| Method                   | Signature                              | What it does                                                                                                     | Used by us                          |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `validateApiKey`         | `(params) => Promise<void>`            | Throws if API key is invalid. Pass `{ key }`.                                                                    | ✅ First call every sync.           |
| `exportData`             | `(params) => Promise<Export>`          | Returns the full user state: `{ meta, today, plans, progress, settings }`. Pass `{ key }`.                       | ✅ Capture as rollback baseline.    |
| `updateAccount`          | `(id, data, options) => Promise<void>` | Surgical patch on a single account by id.                                                                        | ❌ Not used — we restore wholesale. |
| `restoreCurrentFinances` | `(today, options) => Promise<void>`    | Wholesale replace of `today` (current account balances, demographics, assets, debts). Pass `{ key }` in options. | ✅ Push `plan.today`.               |
| `restorePlans`           | `(plans, options) => Promise<void>`    | Wholesale replace of all plans. Accepts a `Plan[]` so multi-scenario is supported. Pass `{ key }` in options.    | ✅ Push `plan.plans`.               |
| `restoreProgress`        | `(progress, options) => Promise<void>` | Wholesale replace of user-owned progress data.                                                                   | ❌ **Never call** — user owns it.   |
| `restoreSettings`        | `(settings, options) => Promise<void>` | Wholesale replace of user-owned settings.                                                                        | ❌ **Never call** — user owns it.   |

There is **no** `getAccounts`, `setAccount`, `getIncomes`, `setIncome`, `getExpenses`, `setExpense`, `getMilestones`, or `setMilestone`. Any code calling those is broken — those names came from a third-party reference that doesn't match the real API.

## Architecture this userscript uses

```
validateApiKey({ key })
    │
    ▼
exportData({ key })                 ← save full export to GM storage as rollback baseline
    │
    ▼
restoreCurrentFinances(plan.today, { key })
    │
    ▼
restorePlans(plan.plans, { key })
```

We deliberately skip `restoreProgress` and `restoreSettings`. The user-owned data stays untouched.

## Why wholesale (and not `updateAccount` per-field)?

1. **Entity identity is by UUID.** Every account/milestone/income/expense in `plan.json` carries the `id` it had when `exportData` returned it. PL replaces by id; new entities get new ids. No name-matching layer needed.
2. **Atomicity.** A wholesale restore either fully lands or fully fails. A loop of `updateAccount` calls can partially succeed and leave PL in a torn state.
3. **Multi-scenario.** `restorePlans` takes `Plan[]`, so we can push current actuals plus N alternative scenarios (inheritance, job offers, retire-early) in one call and switch between them via the PL UI.

## Gotchas

- **`key` goes in the params/options object.** All write methods take `(data, options)` where `options.key` is required.
- **Subscription tier.** The Plugin API may require a paid PL tier. The userscript surfaces 401-class errors clearly so this is easy to diagnose.
- **Schema version drift.** `today.schema` and `plans[*].schema` are PL-internal versions; we copy them through unchanged. If they change between PL releases, an export-then-restore cycle still works.
- **Auth storage.** The API key lives in Tampermonkey `GM_setValue` storage only. It never touches the repo, the disk outside of Tampermonkey, or any third-party service.

## Reference

- Authoritative type docs: <https://app.projectionlab.com/docs/types/PluginAPI.html>
- The `pl-export.json` in this repo's `data/` (gitignored) is a real export and is the source of truth for shape questions.
