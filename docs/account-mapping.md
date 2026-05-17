# Account mapping

`plan.json` identifies accounts by friendly name (e.g., `"Acme Brokerage Taxable"`). ProjectionLab identifies them by opaque ID (e.g., `"acc_abc123"`). The userscript resolves names to IDs in this order:

1. **Explicit `accountMap` override** — set via Tampermonkey storage (`GM_setValue('accountMap', { 'Acme Brokerage Taxable': 'acc_abc123' })`). Use this when fuzzy matching is ambiguous or wrong.
2. **Exact name match** against `pl.getAccounts()`.
3. **Case-insensitive name match.**
4. **Substring match** — if `plan.json` says `"Acme Brokerage Taxable"` and PL has `"Acme Brokerage (Taxable, Joint)"`, the substring match wins as a fallback.
5. **Unresolved.** Reported in the status panel; the sync continues with the resolvable accounts and skips the unresolved one.

## Recommended workflow

- First sync against a fresh PL workspace: let the userscript create accounts using the names from `plan.json`. The resulting IDs become canonical.
- Subsequent syncs hit step 2 (exact match) for free.
- If you rename an account in PL, add an `accountMap` entry to keep the link.

## Storing an `accountMap`

In Tampermonkey, open the userscript dashboard → **Storage** tab → add a JSON value under `accountMap`:

```json
{
  "Acme Brokerage Taxable": "acc_abc123",
  "Acme 401k": "acc_def456"
}
```

(There's no UI helper for editing `accountMap` from inside the page yet; future enhancement if it becomes a real friction point.)
