# Incident response — userscript broken

## When to use this

- The status panel shows red / "last sync failed"
- **Sync now** does nothing visible
- ProjectionLab UI doesn't reflect changes after a sync
- The userscript can't see `window.projectionlabPluginAPI` (timeout error)
- Tampermonkey reports a script error on `app.projectionlab.com`

## Step 1 — stop the bleed

In the Tampermonkey dashboard, find ProjectionLab Finance Sync and **disable** it. This stops it from writing to PL while you investigate. Re-enable once you've isolated and fixed the issue.

## Step 2 — gather signal

Open DevTools (`F12`) on `https://app.projectionlab.com`:

- **Console tab** — filter for `[pl-sync]`. The userscript logs every significant action and error with that prefix.
- **Network tab** — filter for `projectionlab`. Look for failed (red) requests; check the status code and response body.
- **Application tab → Local Storage / IndexedDB** — confirm Tampermonkey has the expected `apiKey` and `plan` values (Tampermonkey storage is separate; check via Tampermonkey dashboard → Storage tab on this script).

## Step 3 — isolate

Common failure modes and where to look:

| Symptom                                              | Likely cause                                                                              | Verify                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `projectionlabPluginAPI did not load within timeout` | PL changed how/when it exposes the API; or page is on a path the userscript doesn't match | `unsafeWindow.projectionlabPluginAPI` in console |
| `401 Unauthorized` on every PL call                  | API key invalid or revoked                                                                | [`key-rotation.md`](key-rotation.md)             |
| `403 Forbidden`                                      | PL subscription tier dropped or Plugin API turned off                                     | PL Settings → Developer → Plugin API             |
| `Plan validation failed: ...`                        | Schema drift between `plan.json` and the validator                                        | [`plan-regeneration.md`](plan-regeneration.md)   |
| Some accounts not synced                             | Account-name resolver couldn't match                                                      | [`../account-mapping.md`](../account-mapping.md) |
| The userscript silently does nothing                 | Tampermonkey reports script errors at the top of its dashboard — check there first        |                                                  |

## Step 4 — fix

- If it's data (key, plan, mapping): fix via the Tampermonkey menu and try again.
- If it's code: don't patch the live userscript in Tampermonkey's editor (that copy will be overwritten on the next auto-update). Open an issue, push a fix to `main` via a PR, let release-please cut a release, let Tampermonkey auto-update.
- If urgent and you must hot-patch: edit in Tampermonkey, also push the same change to `main` so the next release contains it. Note the hot-patch in the issue so the published fix doesn't accidentally regress past your local edit.

## Step 5 — write it up

For anything non-trivial, drop a note in `docs/decisions.md` describing what broke, what fixed it, and whether a guard (test, validator rule, runbook update) should land to prevent recurrence. Promote to an ADR if the response involves a real architectural choice.

## Escalation

- ProjectionLab itself is down → [status.projectionlab.com](https://status.projectionlab.com) (or PL support) — there's nothing this userscript can do.
- GitHub Pages is down → see [`pages-republish.md`](pages-republish.md).
- You suspect the userscript was tampered with (e.g., installed from an URL other than `https://jaetill.github.io/projectionlab-finance-sync/pl-sync.user.js`) → uninstall, reinstall from the canonical URL, rotate the API key per [`key-rotation.md`](key-rotation.md).
