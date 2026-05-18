# Next Steps

Handoff doc for a Cowork session to take `projectionlab-finance-sync` from "scaffold committed" to "userscript live in Tampermonkey, syncing real data into ProjectionLab."

> **About this doc:** Originally written by the scaffolding session at `.claude/worktrees/recursing-kapitsa-da4b66/NEXT_STEPS.md` (a Claude worktree that git considers prunable). Relocated to the repo root so it survives worktree cleanup. The `finance-memo.md` references below are a **generic placeholder** for whatever you've named your private financial memo — in Jason's case it's `jason_finance.md`, but the public repo deliberately doesn't name it that for OPSEC.

## Already done

- Initial scaffold committed (`5939a79 chore: initial scaffold per implementation spec`) on `main`.
- 41 Vitest tests passing (sync, plan validation, account mapping).
- Security audit clear: `data/plan.json` protected by `.gitignore` + `gitleaks` + `block-plan-json` pre-commit hook.
- ADR-0001 documents the six platform deviations (no AWS, no backend, no Sentry, etc.).
- MkDocs Material docs source under `docs/`.
- GitHub Actions workflows authored: `ci.yml`, `docs.yml`, `release.yml`, `deploy-userscript.yml`.
- `release-please` configured (`release-type: simple`, manifest at `.release-please-manifest.json`).
- `userscript/build.js` substitutes `@version` from the manifest into `header.template.js`.

---

## 1. Activate pre-commit hooks (local)

```sh
pip install pre-commit
pre-commit install
pre-commit install --hook-type commit-msg
```

Verify by running once against all files:

```sh
pre-commit run --all-files
```

Expect `gitleaks`, `block-plan-json`, and Conventional Commits hooks to be wired.

## 2. Create the GitHub repo and push

```sh
gh repo create jaetill/projectionlab-finance-sync --public --source=. --remote=origin
git push -u origin main
```

Repo is **public** — `data/plan.json` must never land in a commit.

## 3. Verify first CI run

After the push:

```sh
gh run watch
```

Expect green for: lint, test (41 passing), build (`dist/pl-sync.user.js` produced), gitleaks scan.

Then check that `release-please` opened the first release PR:

```sh
gh pr list --label "autorelease: pending"
```

If no release PR appears, check `.github/workflows/release.yml` permissions and the manifest file.

## 4. Merge the first release PR → verify deploy

Merge the release PR (squash). This tags `v0.x.0` and triggers `deploy-userscript.yml`:

```sh
gh run watch
```

Verify the userscript is live at:

```
https://jaetill.github.io/projectionlab-finance-sync/pl-sync.user.js
```

`curl -I` it and confirm a 200. Confirm the `@version` in the served file matches the new tag.

> First-time gotcha: GitHub Pages must be enabled and set to **GitHub Actions** as the source under repo Settings → Pages. If Pages was never enabled, the deploy job will fail. Enable it, then re-run the job.

## 5. Set up repo secrets

```sh
gh secret set ANTHROPIC_API_KEY
```

Paste the key when prompted. This powers AI PR review (per the `ai-team` plugin config in `.claude/settings.json`).

## 6. Install the userscript in Tampermonkey

In a browser with Tampermonkey installed, open:

```
https://jaetill.github.io/projectionlab-finance-sync/pl-sync.user.js
```

Tampermonkey should show the install prompt. Accept it. From here on, auto-updates flow from `@updateURL`.

## 7. Enable ProjectionLab Plugin API

1. Log into ProjectionLab.
2. Account Settings → enable **Plugin API**.
3. Copy the generated **Plugin API Key**.

## 8. Generate `data/plan.json` from your private memo

**This step is what makes the sync actually do anything.** `plan.json` is generated, not authored — it's a transformation of your private financial memo into the schema the userscript expects.

How:

- Ask Claude (in a Cowork session that has access to your private memo, e.g. the **Financial Decisions and Planning** workspace) to generate `data/plan.json` based on the memo's current account balances, milestones, income, and expenses.
- Schema target: see `data/plan.example.json` and `userscript/src/plan-validator.js` for the validator's exact shape.
- Mapping logic: see `docs/account-mapping.md`.

Where it lands:

- File path: `E:\Users\tille\Documents\Source Code\projectionlab-finance-sync\data\plan.json`
- **Gitignored.** `.gitignore` + `gitleaks` + the `block-plan-json` pre-commit hook are three defenses that prevent accidental commit. Don't disable them.
- Open the file once in your editor before step 9 to spot-check the values against the memo (one row from each section is enough).

Re-run this step any time you update the memo and want PL to reflect the new state.

## 9. Configure the userscript

Open `projectionlab.com`, click the Tampermonkey icon, and run the menu commands the userscript exposes:

- **Set API Key** → paste the Plugin API Key from step 7.
- **Set plan.json** → paste the contents of your local `data/plan.json` from step 8.

Both values are stored via `GM_setValue` in Tampermonkey local storage. Neither leaves the browser.

## 10. First sync test

1. Open the ProjectionLab app page where accounts are listed.
2. Trigger the **Sync** menu command from Tampermonkey.
3. Verify in PL that the accounts and balances from `plan.json` appear.
4. Spot-check one or two values against the memo to confirm the account-mapping logic worked.

If the sync fails: open DevTools → Console. The userscript logs structured messages (`[pl-sync]` prefix). The two common failures are an invalid API key (PL returns 401) and a `plan.json` that doesn't pass the validator (the userscript surfaces the validator error).

---

## When you're done

- Confirm: Tampermonkey shows the script installed, version matches the latest tag, console log shows a successful sync, PL reflects the data.
- Leave the release PR cadence alone — every merged feature/fix commit will roll forward into the next release PR automatically.
