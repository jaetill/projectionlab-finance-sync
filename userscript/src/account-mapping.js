// Resolve a friendly account name from plan.json to a PL account ID.
// Resolution order (per docs/account-mapping.md):
//   1. Explicit accountMap override
//   2. Exact name match against PL accounts
//   3. Case-insensitive match
//   4. Substring match
//   5. Unresolved → null (caller surfaces it; sync skips that account)

function normalize(s) {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

export function resolveAccountId(planAccountName, accountMap, plAccounts) {
  if (!planAccountName) return null;

  if (accountMap && Object.prototype.hasOwnProperty.call(accountMap, planAccountName)) {
    const override = accountMap[planAccountName];
    return override ? override : null;
  }

  const accounts = Array.isArray(plAccounts) ? plAccounts : [];

  const exact = accounts.find((a) => a.name === planAccountName);
  if (exact) return exact.id;

  const target = normalize(planAccountName);
  const ci = accounts.find((a) => normalize(a.name) === target);
  if (ci) return ci.id;

  const substring = accounts.find(
    (a) => normalize(a.name).includes(target) || target.includes(normalize(a.name)),
  );
  if (substring) return substring.id;

  return null;
}

export function resolvePlanAccounts(plan, accountMap, plAccounts) {
  const resolved = [];
  const unresolved = [];
  for (const account of plan.accounts ?? []) {
    const id = resolveAccountId(account.name, accountMap, plAccounts);
    if (id) {
      resolved.push({ planAccount: account, id });
    } else {
      unresolved.push(account);
    }
  }
  return { resolved, unresolved };
}
