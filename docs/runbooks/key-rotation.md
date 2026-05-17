# Rotate the ProjectionLab Plugin API Key

## When to use this

- Routine rotation (recommended every 90 days)
- You suspect the key has leaked (see also [`secret-leak.md`](secret-leak.md))
- You're handing off the userscript to a different ProjectionLab account

## Steps

1. **Revoke the existing key in ProjectionLab.**
   - PL Settings → Developer → Plugin API → find the active key → Revoke.
   - After this step, the userscript will start failing every PL API call until you complete step 4.
2. **Generate a new key.**
   - Same page → **Generate new key**. Copy it to your clipboard immediately (PL may not show it again).
3. **(Optional) Confirm no other tools are using the old key.** If you're sharing the key with the deferred `extract/memo_to_plan.py` script or another userscript, plan their rotation alongside this one.
4. **Set the new key in Tampermonkey.**
   - Visit https://app.projectionlab.com.
   - Tampermonkey icon → ProjectionLab Finance Sync → **Set PL API Key** → paste new value.
5. **Verify.**
   - Same menu → **Sync now**. Status panel should report success and an updated timestamp.

## Rollback

You can't un-revoke a key. If you can't get the new key working:

- Generate another new key in PL and try again — the old revoked one is gone.
- Confirm the userscript is enabled in Tampermonkey (not disabled by a recent troubleshooting step).

## Escalation

If syncs fail after a rotation, check:

- Was the key copy-pasted with leading/trailing whitespace? The userscript trims, but worth double-checking.
- Did your PL subscription change tier? Plugin API access may require a specific tier.
- Browser console (`F12`): look for `[pl-sync]` errors.

[File an issue](https://github.com/jaetill/projectionlab-finance-sync/issues/new) if symptoms don't match anything here.
