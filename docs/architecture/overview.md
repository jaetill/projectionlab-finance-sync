# Architecture overview

## Components

```
┌──────────────────────┐        ┌──────────────────────────────┐
│ finance-memo.md      │        │ ProjectionLab (app.projection│
│ (private memo,       │        │ lab.com)                     │
│ outside this repo)   │        │                              │
└──────────┬───────────┘        │  window.projectionlabPluginAPI│
           │ Claude reads        │                              │
           ▼ on demand           └────────────────▲─────────────┘
┌──────────────────────┐                          │
│ plan.json            │                          │
│ (gitignored, lives   │                          │
│ in Tampermonkey      │                          │
│ storage at runtime)  │                          │
└──────────┬───────────┘                          │
           │                                      │
           │  GM_getValue('plan')                 │ pl.setAccount(...)
           ▼                                      │ pl.setMilestone(...)
┌──────────────────────────────────────────────────┴────────────┐
│ pl-sync.user.js (this repo, hosted on GitHub Pages)            │
│                                                                │
│ • Configuration helpers (apiKey / plan / accountMap)           │
│ • Plan validator                                               │
│ • Account-name → PL account-ID resolver                        │
│ • Sync logic (idempotent diff-and-push)                        │
│ • Status panel UI                                              │
│ • Tampermonkey menu commands                                   │
└────────────────────────────────────────────────────────────────┘
```

## Data flow

1. User triggers **Sync now** from the Tampermonkey menu (no auto-sync — explicit-action principle for a tool that mutates financial data).
2. The userscript reads `apiKey`, `plan`, and `accountMap` from `GM_getValue`.
3. The userscript waits for `unsafeWindow.projectionlabPluginAPI` to be ready.
4. The sync routine reads existing PL state (accounts, milestones, income, expenses), diffs against `plan.json`, and calls the appropriate Plugin API setters.
5. The status panel updates with counts and any errors.

## Why no backend

The PL Plugin API is intentionally browser-side. Adding a server in front of it would not add value — it would only widen attack surface and create a place where `plan.json` could be intercepted in transit. The userscript runs entirely in the user's browser; `plan.json` and the API key never leave it.

## Why no remote telemetry

Any "send error reports somewhere" mechanism is itself a privacy leak — it would ship details about the user's PL session and possibly their `plan.json` contents to a third party. Errors are surfaced in the in-page status panel and (with a `[pl-sync]` prefix) to the browser console only.

## Security boundaries

| Asset             | Where it lives                             | What protects it                                                         |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| `data/plan.json`  | Local filesystem only, gitignored          | `.gitignore` + gitleaks content scan + custom pre-commit path-block hook |
| PL Plugin API key | Tampermonkey local storage (`GM_setValue`) | Never written to any repo file; not even a placeholder in `.env.example` |
| Userscript source | Public GitHub repo                         | Signed commits + branch protection + AI PR review                        |
