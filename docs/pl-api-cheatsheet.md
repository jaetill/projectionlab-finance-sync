# ProjectionLab Plugin API cheatsheet

Quick reference for the `window.projectionlabPluginAPI` surface this userscript depends on. Method names below are best-effort from the [georgeck/projectionlab-monarchmoney-import](https://github.com/georgeck/projectionlab-monarchmoney-import) reference; **confirm against ProjectionLab's official Plugin API docs before relying on any specific call**.

## Where the API lives

`unsafeWindow.projectionlabPluginAPI` — loaded by the ProjectionLab app itself. Userscripts need `unsafeWindow` (not `window`) because Tampermonkey wraps the page's `window` by default.

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

## Methods this userscript calls

| Method                    | Purpose                      | Notes                                    |
| ------------------------- | ---------------------------- | ---------------------------------------- |
| `getAccounts()`           | List existing accounts       | Used by sync to diff against `plan.json` |
| `setAccount(account)`     | Upsert an account (by ID)    | Idempotent; same input → same state      |
| `getMilestones()`         | List existing milestones     |                                          |
| `setMilestone(milestone)` | Upsert a milestone           |                                          |
| `getIncomes()`            | List existing income streams |                                          |
| `setIncome(income)`       | Upsert an income stream      |                                          |
| `getExpenses()`           | List existing expenses       |                                          |
| `setExpense(expense)`     | Upsert an expense            |                                          |

## Gotchas

- **Method names are not final.** Verify against PL's current Plugin API docs. The userscript wraps every call in try/catch and surfaces failures in the status panel rather than throwing.
- **Auth.** PL Plugin API authentication mechanism is set per session via the API Key entered in PL Settings → Developer → Plugin API. Our userscript stores the user's copy of that key in Tampermonkey storage only.
- **Account-ID resolution.** `plan.json` references accounts by friendly name; PL identifies them by opaque ID. See [account-mapping.md](account-mapping.md).
- **Subscription tier.** PL Plugin API may require a paid tier. Document the exact requirement in [`runbooks/install.md`](runbooks/install.md) once confirmed.
