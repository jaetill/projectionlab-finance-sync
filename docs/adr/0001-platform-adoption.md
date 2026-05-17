# 0001 — Platform standards adoption with documented deviations

- **Status:** Accepted
- **Date:** 2026-05-11
- **Deciders:** Jason Tilley
- **Tags:** platform, standards, deviations

## Context and problem statement

This project follows the [Agentic Dev Environment](../../README.md) platform standards. The platform was designed for full-stack web apps with a backend, AWS infrastructure, observability, and (often) multiple users. This project — a Tampermonkey userscript — has none of that. Most platform standards apply, but six need explicit deviations called out, so reviewers (human or AI) don't flag the absences as gaps.

## Decision drivers

- Public repo containing references to financial-data tooling — discipline around what _isn't_ here matters as much as what is.
- The userscript must remain a single hand-readable file installable by anyone with Tampermonkey.
- Adding a server in front of the PL Plugin API would only widen attack surface; ditto remote telemetry.

## Considered options

1. **Adopt the platform wholesale** — including a backend wrapper, Sentry, an AWS deploy pipeline. Adds work and attack surface for no user-visible benefit.
2. **Adopt only the standards that fit and document the rest as deviations** (chosen).
3. **Reject the platform and roll bespoke conventions.** Loses the AI-review pipeline and the standard secret-discipline gates.

## Decision outcome

Chosen option: **Option 2 — adopt the standards that fit, document six explicit deviations.**

### The six deviations

1. **No backend service.** Browser-side only. PL Plugin API is client-side by design.
2. **No AWS infrastructure.** Follows from #1.
3. **No Sentry or remote telemetry.** Any error reporting that leaves the browser is itself a privacy leak (it would ship PL session details and possibly `plan.json` to a third party). Errors live only in the in-page status panel and the browser console with a `[pl-sync]` prefix.
4. **Deploy = userscript-publish-to-GitHub-Pages.** Not Lambda / Vercel / S3+CloudFront. Tampermonkey points at the GitHub Pages URL and auto-updates from there.
5. **Single user (Jason) initially; Standard 11 reduced to a GitHub Issues link.** No in-app feedback widget. Revisit fully via a follow-up ADR if the project widens beyond Jason.
6. **Default branch `main` matches platform default.** Called out for parity with sibling projects (game-night-pwa's ADR-0001 had to document `master`); no actual deviation here.

### What still applies with full force

- **Standard 01 (Source control):** GitHub Flow on `main`, Conventional Commits, SSH-signed commits, branch protection (signed + linear + no force-push), squash merge.
- **Standard 03 (Testing):** Vitest + happy-dom with tiered coverage (sync.js + auth.js at 90/80; UI helpers at 60/50; default 80/70).
- **Standard 04 (Quality gates):** ESLint flat config + Prettier + pre-commit (gitleaks + commitlint + lint-staged + custom plan.json path block) + Semgrep + GitHub secret scanning. Security-critical here.
- **Standard 05 (Documentation):** MADR ADRs + MkDocs Material + six runbooks (install, key rotation, plan regeneration, Pages republish, secret leak, incident response).
- **Standard 07 (Secrets management):** `plan.json` + API key never in Git. No `.env` placeholder for the API key — we don't want the field name in repo-tracked files where a copy-paste could land a real value.
- **Standard 09 (Release management):** release-please drives semver tags; userscript `@version` is substituted at build time from `.release-please-manifest.json`.
- **Standard 10 (AI workflows):** 12 specialist subagents, 10 slash commands, hooks.

### Consequences

- **Positive:** Smallest-surface-area userscript with rigorous secret discipline. Reviewers can scan `data/` and `userscript/` confidently knowing what's missing is missing by design.
- **Negative:** No telemetry means bugs that only manifest in the user's browser are invisible unless the user reports them. Acceptable trade-off for single-user; revisit if widened.
- **Followups:**
  - ADR-0002 (open): schema versioning and migration policy for `plan.json`.
  - Reconsider Standard 11 if the project ever has more than one user.

## Links

- Spec: [`docs/verification/projectionlab-finance-sync-implementation-spec.md`](https://github.com/jaetill/projectionlab-finance-sync/blob/main/docs/verification/projectionlab-finance-sync-implementation-spec.md) (lives in the platform repo)
- Community reference: [georgeck/projectionlab-monarchmoney-import](https://github.com/georgeck/projectionlab-monarchmoney-import)
