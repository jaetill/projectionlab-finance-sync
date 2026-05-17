# projectionlab-finance-sync

A [Tampermonkey](https://www.tampermonkey.net/) userscript that syncs financial data into [ProjectionLab](https://projectionlab.com) via its browser-side Plugin API (`window.projectionlabPluginAPI`).

The source of truth is a private `finance-memo.md` memo (kept outside this repo). Claude transforms it on demand into a `plan.json`, which the userscript reads from Tampermonkey storage and pushes into ProjectionLab.

## Install

In a browser with Tampermonkey installed, visit:

```
https://jaetill.github.io/projectionlab-finance-sync/pl-sync.user.js
```

Full instructions: [`docs/runbooks/install.md`](docs/runbooks/install.md).

## Security model

Three layers protect real financial data from ever entering Git:

1. **`.gitignore`** — `data/plan.json` and `api-key.local` are listed.
2. **`gitleaks`** — content scan in pre-commit and CI.
3. **Custom pre-commit hook `block-plan-json`** — refuses staged paths matching `data/plan.json` even if added with `git add -f`.

The **PL Plugin API key** lives only in Tampermonkey local storage (`GM_setValue`). It is never written to any repo file — not even `.env.example` lists the field name, by design.

The repo is **public**. Source visible; real numbers never present.

If something leaks anyway: [`docs/runbooks/secret-leak.md`](docs/runbooks/secret-leak.md).

## Project structure

```
projectionlab-finance-sync/
├── data/
│   ├── plan.example.json       # sanitized schema reference (committed)
│   ├── plan.json               # REAL DATA — never commit; gitignored + pre-commit blocked
│   └── README.md
├── userscript/
│   ├── pl-sync.user.js         # the userscript (single-file IIFE)
│   ├── header.template.js      # // ==UserScript== block with @version placeholder
│   ├── build.js                # substitutes @version, writes dist/pl-sync.user.js
│   └── src/                    # parallel ES-module copies (unit-tested)
├── tests/
│   ├── setup.js                # GM_* + projectionlabPluginAPI stubs
│   └── unit/                   # *.test.js
├── extract/
│   └── README.md               # deferred Python memo→plan extractor (interface only)
├── docs/                       # MkDocs Material source (rendered to GitHub Pages)
└── .github/workflows/          # ci, docs, release, deploy-userscript
```

## Develop

```sh
npm install
npm test
npm run lint
npm run format:check
npm run build         # writes dist/pl-sync.user.js with @version from .release-please-manifest.json
```

For local browser testing, install `dist/pl-sync.user.js` in Tampermonkey via its dashboard.

## Release

- Push to `main` with [Conventional Commits](https://www.conventionalcommits.org/).
- `release-please` opens a release PR with a CHANGELOG entry and a manifest bump.
- Merging the release PR creates a `v*` tag.
- The `deploy-userscript` workflow rebuilds the `.user.js` with the new `@version` and publishes to GitHub Pages.
- Tampermonkey clients auto-update on their next poll.

## Documentation

Rendered: https://jaetill.github.io/projectionlab-finance-sync/

| Topic                          | Page                                                                       |
| ------------------------------ | -------------------------------------------------------------------------- |
| Architecture                   | [`docs/architecture/overview.md`](docs/architecture/overview.md)           |
| Plugin API cheatsheet          | [`docs/pl-api-cheatsheet.md`](docs/pl-api-cheatsheet.md)                   |
| Account mapping                | [`docs/account-mapping.md`](docs/account-mapping.md)                       |
| Install runbook                | [`docs/runbooks/install.md`](docs/runbooks/install.md)                     |
| Key rotation                   | [`docs/runbooks/key-rotation.md`](docs/runbooks/key-rotation.md)           |
| Plan regeneration              | [`docs/runbooks/plan-regeneration.md`](docs/runbooks/plan-regeneration.md) |
| Pages republish                | [`docs/runbooks/pages-republish.md`](docs/runbooks/pages-republish.md)     |
| Secret leak                    | [`docs/runbooks/secret-leak.md`](docs/runbooks/secret-leak.md)             |
| Incident response              | [`docs/runbooks/incident-response.md`](docs/runbooks/incident-response.md) |
| ADR-0001 — Platform deviations | [`docs/adr/0001-platform-adoption.md`](docs/adr/0001-platform-adoption.md) |

## Found a bug?

[Open an issue](https://github.com/jaetill/projectionlab-finance-sync/issues/new).

## License

MIT — see [LICENSE](LICENSE).
