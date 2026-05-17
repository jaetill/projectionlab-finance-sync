# projectionlab-finance-sync — Claude Context

## What this app is

A **Tampermonkey userscript** that pushes Jason's financial data into [ProjectionLab](https://projectionlab.com) via its browser-side Plugin API (`window.projectionlabPluginAPI`). The source-of-truth for financial data is a private `finance-memo.md` memo (NOT in this repo). Claude transforms it on demand into a `plan.json`, which the userscript reads from Tampermonkey storage (`GM_getValue`) and pushes into PL.

Distribution: `userscript/pl-sync.user.js` is hosted via GitHub Pages at `https://jaetill.github.io/projectionlab-finance-sync/pl-sync.user.js`. Tampermonkey auto-updates from that URL on every release.

## Tech stack & hosting

| Layer            | Technology                               | Notes                                                                                             |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Userscript       | Vanilla JS, ES2022, single IIFE          | No bundler/framework — file is hand-readable, Tampermonkey installs as-is                         |
| Build            | Tiny Node script (`userscript/build.js`) | Substitutes `@version` into header template; emits `dist/pl-sync.user.js`                         |
| Tests            | Vitest + happy-dom                       | `GM_*` and `projectionlabPluginAPI` stubbed in `tests/setup.js`                                   |
| Lint/format      | ESLint flat config + Prettier            | Prettier ignores `userscript/pl-sync.user.js` so the `// ==UserScript==` header is never reflowed |
| Docs             | MkDocs Material                          | Deployed to GitHub Pages alongside the `.user.js`                                                 |
| Distribution     | GitHub Pages                             | `@updateURL`/`@downloadURL` point at the Pages URL                                                |
| Release          | release-please (release-type: simple)    | Conventional Commits → semver tags → `@version` bump                                              |
| AI configuration | `ai-team` plugin subscription            | Per game-night-pwa ADR-0015 — see `.claude/settings.json`                                         |

## No AWS

This project has zero AWS resources. See ADR-0001 — six explicit deviations from platform defaults, including no backend, no AWS, no observability stack.

## Repo layout

```
projectionlab-finance-sync/
├── data/
│   ├── plan.example.json     — sanitized schema reference, committed
│   ├── plan.json             — REAL DATA — never commit; gitignored + pre-commit blocked + gitleaks scanned
│   └── README.md
├── userscript/
│   ├── pl-sync.user.js       — the userscript (single file, IIFE, Prettier-ignored)
│   ├── header.template.js    — // ==UserScript== block with @version placeholder
│   ├── build.js              — substitutes @version from .release-please-manifest.json
│   └── src/                  — split-out modules (config/validator/mapping/sync/ui)
├── tests/
│   ├── setup.js              — GM_* + projectionlabPluginAPI stubs
│   └── unit/                 — *.test.js (sync, plan-validation, account-mapping)
├── extract/
│   └── README.md             — documents the deferred Python memo→plan extractor
├── docs/                     — MkDocs Material source
└── .github/workflows/        — ci, docs, release, deploy-userscript
```

## Security model

- **`data/plan.json`** (real balances) — three layers protect it:
  1. `.gitignore`
  2. `gitleaks` content scan in pre-commit + CI
  3. Custom `block-plan-json` pre-commit hook (path-based, defense in depth)
- **PL Plugin API key** — Tampermonkey local storage only via `GM_setValue`. NEVER written to any repo file. **No** `.env.example` placeholder for it — we don't want the field name visible in repo-tracked files where a copy-paste could land a real value.
- **Repo is PUBLIC.** Source visible; real numbers never in repo.

## Build & test

```sh
npm install
npm test          # Vitest
npm run lint
npm run format:check
npm run build     # produces dist/pl-sync.user.js with @version from .release-please-manifest.json
```

## Deployment

- **PR merge to `main`** → release-please opens or updates a release PR.
- **Merge the release PR** → tag created (e.g. `v0.2.0`) → `deploy-userscript.yml` rebuilds the `.user.js` and publishes to GitHub Pages.
- Tampermonkey periodically checks `@updateURL` and prompts the user to update.

**Gotchas:**

- Do NOT edit the live userscript in Tampermonkey's editor — the next auto-update overwrites it. Push to `main` instead.
- Do NOT commit `data/plan.json`. The three-layer guard will block you, but don't lean on it.
- Do NOT add Sentry / any remote telemetry. See ADR-0001.
- Do NOT add a bundler (Vite, Webpack) — the build is intentionally a `cat` of header + source.
- Prettier ignores `userscript/pl-sync.user.js` so the metadata header survives.

## Local dev

- The userscript is testable via Vitest without ever launching a browser; `GM_*` is stubbed in `tests/setup.js`.
- For real browser testing, install your locally-built `dist/pl-sync.user.js` in Tampermonkey via `file://` URL or the dashboard "Create new script" flow, then iterate.

## Memory hierarchy

- **Global `~/.claude/CLAUDE.md`** — Jason's identity, AWS-wide patterns (NB: this project has no AWS resources but the global file still loads).
- **Workspace `E:\Users\tille\Documents\Source Code\CLAUDE.md`** — cross-project conventions, project inventory.
- **This file** — project-specific context.
- **`memory/`** (under Claude's user-spaces; not in this repo) — long-lived facts about the project.
