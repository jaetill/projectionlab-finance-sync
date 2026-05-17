# projectionlab-finance-sync

A Tampermonkey userscript that syncs Jason's financial data into [ProjectionLab](https://projectionlab.com) via its browser-side Plugin API.

## Quick links

- [Install the userscript](runbooks/install.md)
- [Architecture overview](architecture/overview.md)
- [Plugin API cheatsheet](pl-api-cheatsheet.md)
- [Account mapping](account-mapping.md)
- [Decision records](adr/index.md)
- [Runbooks](runbooks/index.md)

## What this project is

- **Source of truth:** a private `finance-memo.md` memo (not in this repo)
- **Transform:** Claude reads the memo, emits a `plan.json` matching [`data/plan.example.json`'s schema](https://github.com/jaetill/projectionlab-finance-sync/blob/main/data/plan.example.json)
- **Sync:** the userscript reads `plan.json` from Tampermonkey storage and pushes it into ProjectionLab via `window.projectionlabPluginAPI`
- **Distribution:** the `.user.js` is hosted on GitHub Pages so Tampermonkey can auto-update from it

## What this project is NOT

- Not a backend service. No Lambda, no Vercel, no AWS.
- Not observability-instrumented. No Sentry, no remote telemetry. The only error surface is the in-page status panel.
- Not a multi-user platform. Single-user (Jason) for now; revisit Standard 11 fully via ADR-0002 if that changes.

See [ADR-0001](adr/0001-platform-adoption.md) for the full list of deviations from the platform defaults.
