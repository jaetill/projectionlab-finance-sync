// Account helpers — pure functions over the PL `today` payload.
//
// Historical note: this file used to host a name → id resolution layer. The
// real Plugin API is UUID-native, so resolution isn't needed; the file is
// kept (filename + tests) and repurposed for read-only summaries the UI uses.

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function allAccounts(today) {
  return [...asArray(today?.savingsAccounts), ...asArray(today?.investmentAccounts)];
}

export function summarizeToday(today) {
  const accounts = allAccounts(today);
  const debts = asArray(today?.debts);
  const assets = asArray(today?.assets);

  const totalCash = asArray(today?.savingsAccounts).reduce(
    (sum, a) => sum + (Number(a?.balance) || 0),
    0,
  );
  const totalInvested = asArray(today?.investmentAccounts).reduce(
    (sum, a) => sum + (Number(a?.balance) || 0),
    0,
  );
  const totalDebt = debts.reduce((sum, d) => sum + (Number(d?.balance) || 0), 0);
  const totalAssetValue = assets.reduce((sum, a) => sum + (Number(a?.balance) || 0), 0);

  return {
    accountCount: accounts.length,
    savingsCount: asArray(today?.savingsAccounts).length,
    investmentCount: asArray(today?.investmentAccounts).length,
    debtCount: debts.length,
    assetCount: assets.length,
    totalCash,
    totalInvested,
    totalDebt,
    totalAssetValue,
    netWorth: totalCash + totalInvested + totalAssetValue - totalDebt,
  };
}

export function groupByType(accounts) {
  const out = {};
  for (const a of asArray(accounts)) {
    const t = a?.type ?? 'unknown';
    if (!out[t]) out[t] = [];
    out[t].push(a);
  }
  return out;
}

export function findById(today, id) {
  if (!id) return null;
  const buckets = ['savingsAccounts', 'investmentAccounts', 'debts', 'assets'];
  for (const k of buckets) {
    for (const item of asArray(today?.[k])) {
      if (item?.id === id) return { bucket: k, item };
    }
  }
  return null;
}

export function countPlanEntities(plan) {
  // Counts events across all plans for the status panel.
  const plans = asArray(plan?.plans);
  let milestones = 0;
  let income = 0;
  let expenses = 0;
  let accountEvents = 0;
  let assetEvents = 0;
  for (const p of plans) {
    milestones += asArray(p?.milestones).length;
    income += asArray(p?.income?.events).length;
    expenses += asArray(p?.expenses?.events).length;
    accountEvents += asArray(p?.accounts?.events).length;
    assetEvents += asArray(p?.assets?.events).length;
  }
  return {
    planCount: plans.length,
    milestones,
    income,
    expenses,
    accountEvents,
    assetEvents,
  };
}
