# Secret leak — `plan.json` or PL API Key

## When to use this

- You pushed `data/plan.json` to GitHub by accident (or any other location it shouldn't be)
- You pasted your PL Plugin API Key into a chat, a public Gist, a PR comment, a screenshot, etc.
- A security scan flagged a secret in this repo

## Triage — what kind of leak

| Leaked thing             | What it exposes                                                     | Reversible?                                                     |
| ------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| **PL Plugin API Key**    | Read/write access to your ProjectionLab account via the Plugin API  | YES — revoke and rotate (see below)                             |
| **`plan.json` contents** | Account balances, income, expenses, milestones — financial snapshot | NO — the data is exposed; you can only mitigate future exposure |

## Immediate steps — PL API Key leaked

1. **Revoke the key in PL.** Settings → Developer → Plugin API → Revoke. This is your priority — do it before anything else.
2. **Rotate.** Generate a new key. Update the Tampermonkey-stored key per [`key-rotation.md`](key-rotation.md).
3. **Scrub the leak source.** Delete the message/Gist/screenshot/etc. Be aware: this does NOT erase it from caches, logs, or other people's inboxes. The revocation in step 1 is what actually protects you.
4. **Audit recent PL activity.** Open ProjectionLab and skim recent changes for anything you didn't make. If you find unauthorized changes, document them and consider the scope of the compromise.

## Immediate steps — `plan.json` leaked

1. **You cannot un-leak data.** Revoking nothing fixes this. The financial snapshot is now exposed in whatever venue it leaked to (Git history, chat log, etc.).
2. **Scrub what you can.** If it landed in this repo:
   - `git filter-repo --path data/plan.json --invert-paths --force` then force-push (this rewrites history).
   - Force the GitHub repo's cached views to refresh by contacting GitHub Support and asking for a cache purge if the file is sensitive enough.
   - Recognize that anyone who cloned or read the repo between the push and the scrub has the data.
3. **Decide if the exposure warrants any other action.** Was anything in `plan.json` actually sensitive enough to require notifying anyone affected (a co-owned account, a joint financial situation)? Document the decision either way.
4. **Rotate the PL API Key anyway** (step 1 of the API-key section above), in case the same incident exposed the key.
5. **Tighten the gate that failed.** Three protections exist; figure out which one(s) failed and why:
   - `.gitignore` — was the file added with `git add -f`?
   - gitleaks pre-commit — was the hook skipped (`--no-verify`)?
   - custom `block-plan-json` pre-commit hook — same question
   - If hooks were skipped: do not skip hooks in this repo. Period. If a hook is genuinely broken, fix the hook, don't bypass it.

## Verification

After API-key rotation:

- Old key returns `401 Unauthorized` from any PL API request (test by manually crafting a request, or just wait for the next sync attempt with the old key to fail).
- New key works in **Sync now**.

After `plan.json` scrub:

- `git log --all -- data/plan.json` shows no entries.
- `git log -p --all -S "<a unique balance from plan.json>"` returns nothing.

## Escalation

If you don't know whether the API key is still active, assume it is — revoke it. The cost of revoking a still-valid key is one rotation; the cost of leaving a leaked key live can be much higher.

[File an issue](https://github.com/jaetill/projectionlab-finance-sync/issues/new) tagged `security` once the leak is contained, so the postmortem produces a repo improvement (a new pre-commit rule, a CI check, etc.).
