# Republish the userscript to GitHub Pages

## When to use this

- The release workflow ran but `https://jaetill.github.io/projectionlab-finance-sync/pl-sync.user.js` is showing the old version
- You manually fixed the `@version` header in a hotfix and need to push the updated file
- You're recovering from a botched GitHub Pages deploy

## Normal flow (automatic)

On every release tag:

1. `release-please` merges a release PR on `main`, which creates a Git tag like `v1.2.0`.
2. The tag triggers `.github/workflows/deploy-userscript.yml`, which:
   - Runs `npm run build` (substitutes `@version` from `.release-please-manifest.json` into `userscript/header.template.js`, produces `dist/pl-sync.user.js`).
   - Uploads `dist/pl-sync.user.js` to the `gh-pages` branch (or the GitHub Pages artifact path) alongside the MkDocs site.
3. GitHub Pages serves it at `https://jaetill.github.io/projectionlab-finance-sync/pl-sync.user.js`.

Tampermonkey checks `@updateURL` periodically (per its own schedule, typically daily) and prompts the user to update.

## Manual republish

If the automatic flow didn't fire or produced the wrong artifact:

1. Confirm the version in `.release-please-manifest.json` matches the release tag (`gh release view <tag>`).
2. Trigger the workflow manually:
   ```
   gh workflow run deploy-userscript.yml --ref main
   ```
3. Watch it:
   ```
   gh run list --workflow=deploy-userscript.yml --limit 1
   gh run watch <run-id>
   ```
4. Verify:
   ```
   curl -sI https://jaetill.github.io/projectionlab-finance-sync/pl-sync.user.js | head -n 5
   curl -s https://jaetill.github.io/projectionlab-finance-sync/pl-sync.user.js | head -n 20
   ```
   The `@version` line in the header should match the intended release.

## Rollback

`git revert` the offending commit on `main` and let `release-please` produce a new release with the reverted code. There is no "deploy this old artifact" button — releases are forward-only.

## Escalation

If GitHub Pages itself is unhealthy ([status](https://www.githubstatus.com/)), wait it out. If the workflow consistently fails with the same error, file an issue and disable auto-update by removing the `@updateURL` line from your locally installed userscript until resolved.
