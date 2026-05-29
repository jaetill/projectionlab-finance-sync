/**
 * Scenarios — parse the memo's `## Scenarios` section and compose PL plans.
 *
 * The memo declares scenarios as sparse patches over a base case. Each
 * scenario gets its own `### name` heading followed by a list of one-line
 * levers:
 *
 *   ## Scenarios
 *
 *   ### base
 *   The current path. No overrides.
 *
 *   ### inherit-1m
 *   - effective: 2030-01-01
 *   - one-time-event: +$1,000,000 to vanguard-brokerage on 2030-01-01
 *
 *   ### lifestyle-12k
 *   - effective: 2026-08-01
 *   - lifestyle-target: $12,000/mo
 *
 * Supported levers (extended in PR-K2 with state-tax-rate):
 *   - effective:                ISO date when the scenario perturbation kicks in
 *   - lifestyle-target:         replaces the Lifestyle expense event amount
 *   - retirement-date.<person>: shifts the retirement milestone
 *   - one-time-event:           adds a windfall/expense at a date on a named account
 *   - state-tax-rate:           overrides plan.variables.localIncomeTaxRate (percent)
 *
 * Compound levers (housing-event, etc.) are deferred — they need multi-line
 * syntax. Unknown lever names hard-fail at parse time so silent typos don't
 * become silent projection errors.
 */

// ---------------------------------------------------------------------------
// Lever whitelist
// ---------------------------------------------------------------------------

export const KNOWN_LEVERS = new Set([
  'effective',
  'lifestyle-target',
  'retirement-date.jason',
  'retirement-date.heidi',
  'one-time-event',
  'state-tax-rate',
]);

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Find the markdown range of the `## Scenarios` section.
 * Returns the section text (from the heading to the next `## ` heading or EOF),
 * or null if absent.
 */
export function findScenariosSection(markdown) {
  const re = /^##\s+Scenarios\s*$/im;
  const m = re.exec(markdown);
  if (!m) return null;
  const start = m.index + m[0].length;
  const tail = markdown.slice(start);
  const nextHeading = tail.search(/\n##\s/);
  return nextHeading === -1 ? tail : tail.slice(0, nextHeading);
}

/**
 * Parse a single lever line ("- name: value") into { name, raw }.
 * Returns null when the line doesn't match the expected shape.
 */
export function parseLeverLine(line) {
  // Allow leading whitespace + "- " or "* " bullet
  const m = line.match(/^\s*[-*]\s*([A-Za-z][A-Za-z0-9.-]*)\s*:\s*(.+?)\s*$/);
  if (!m) return null;
  return { name: m[1].toLowerCase(), raw: m[2].trim() };
}

/**
 * Parse a lifestyle-target raw value into a structured form.
 *   "$12,000/mo"   -> { mode: 'absolute', amount: 12000, unit: 'monthly' }
 *   "$144,000/yr"  -> { mode: 'absolute', amount: 144000, unit: 'yearly' }
 *   "$9,700"       -> { mode: 'absolute', amount: 9700, unit: 'monthly' }  (default)
 */
export function parseLifestyleTarget(raw) {
  const m = raw.match(/^\$?([\d,]+(?:\.\d+)?)\s*(?:\/\s*(mo|yr|month|year|monthly|yearly))?$/i);
  if (!m) throw new Error(`scenarios: invalid lifestyle-target value: "${raw}"`);
  const amount = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(amount))
    throw new Error(`scenarios: lifestyle-target not a number: "${raw}"`);
  const unitRaw = (m[2] || 'monthly').toLowerCase();
  const unit = ['mo', 'month', 'monthly'].includes(unitRaw) ? 'monthly' : 'yearly';
  return { mode: 'absolute', amount, unit };
}

/**
 * Parse a one-time-event raw into a structured event.
 *   "+$1,000,000 to vanguard-brokerage on 2030-01-01"
 *   "-$50,000 from ally-savings on 2027-08-01"
 */
export function parseOneTimeEvent(raw) {
  const m = raw.match(
    /^([+-])\$?([\d,]+(?:\.\d+)?)\s+(to|from)\s+([a-z0-9-]+)\s+on\s+(\d{4}-\d{2}-\d{2})\s*$/i,
  );
  if (!m) throw new Error(`scenarios: invalid one-time-event value: "${raw}"`);
  const [, sign, amountStr, direction, account, date] = m;
  const amount = Number(amountStr.replace(/,/g, ''));
  if (!Number.isFinite(amount))
    throw new Error(`scenarios: one-time-event amount not a number: "${raw}"`);
  const polarity = sign === '+' || direction.toLowerCase() === 'to' ? 'in' : 'out';
  return { direction: polarity, amount, account, date };
}

/**
 * Parse a state-tax-rate raw value into a percent number.
 *   "0%"     -> 0
 *   "5.75%"  -> 5.75
 *   "5.75"   -> 5.75
 *   "0"      -> 0
 *
 * Throws on malformed input. PL treats `plan.variables.localIncomeTaxRate`
 * as a percent, so "5.75%" maps directly to 5.75 — don't double-divide.
 */
export function parseStateTaxRate(raw) {
  const m = raw.match(/^(-?\d+(?:\.\d+)?)\s*%?$/);
  if (!m) throw new Error(`scenarios: invalid state-tax-rate value: "${raw}"`);
  const value = Number(m[1]);
  if (!Number.isFinite(value)) throw new Error(`scenarios: state-tax-rate not a number: "${raw}"`);
  return value;
}

function parseRetirementDate(raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`scenarios: retirement-date.* must be YYYY-MM-DD, got "${raw}"`);
  }
  return raw;
}

function parseEffective(raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`scenarios: effective must be YYYY-MM-DD, got "${raw}"`);
  }
  return raw;
}

/**
 * Parse the full Scenarios section into a list of scenario objects.
 * Throws on unknown lever names so typos don't silently misproject.
 *
 * Returns:
 *   [{ name, slug, effective?, overrides: { lifestyle-target?, retirement-date?: {...}, one-time-event?: [...] } }]
 */
export function parseScenarios(markdown) {
  const section = findScenariosSection(markdown);
  if (!section) return [];

  const lines = section.split('\n');
  const scenarios = [];
  let current = null;

  for (const line of lines) {
    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading) {
      if (current) scenarios.push(current);
      const name = heading[1].trim();
      current = {
        name,
        slug: name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, ''),
        effective: null,
        overrides: {
          'lifestyle-target': null,
          'retirement-date': {},
          'one-time-event': [],
          'state-tax-rate': null,
        },
      };
      continue;
    }
    if (!current) continue;
    const lever = parseLeverLine(line);
    if (!lever) continue;
    if (!KNOWN_LEVERS.has(lever.name)) {
      throw new Error(
        `scenarios: unknown lever "${lever.name}" in scenario "${current.name}". Known levers: ${[...KNOWN_LEVERS].join(', ')}`,
      );
    }
    if (lever.name === 'effective') {
      current.effective = parseEffective(lever.raw);
    } else if (lever.name === 'lifestyle-target') {
      current.overrides['lifestyle-target'] = parseLifestyleTarget(lever.raw);
    } else if (lever.name === 'retirement-date.jason') {
      current.overrides['retirement-date'].jason = parseRetirementDate(lever.raw);
    } else if (lever.name === 'retirement-date.heidi') {
      current.overrides['retirement-date'].heidi = parseRetirementDate(lever.raw);
    } else if (lever.name === 'one-time-event') {
      current.overrides['one-time-event'].push(parseOneTimeEvent(lever.raw));
    } else if (lever.name === 'state-tax-rate') {
      current.overrides['state-tax-rate'] = parseStateTaxRate(lever.raw);
    }
  }
  if (current) scenarios.push(current);
  return scenarios;
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

function findMilestoneByPerson(plan, person) {
  // Names contain "Jason's" / "Heidi's" / fallback to slugs and ids
  const pat = person === 'jason' ? /jason|your/i : /heidi|spouse/i;
  for (const m of plan.milestones || []) {
    if (pat.test(m.name) && /retirement/i.test(m.name)) return m;
  }
  return null;
}

function findLifestyleExpense(plan) {
  const events = plan?.expenses?.events || [];
  return events.find((e) => /lifestyle/i.test(e.name)) || null;
}

/**
 * Compose a single PL plan from a base plan + a scenario's overrides.
 *
 * Each scenario's PL ids are slug-suffixed so two plans can coexist in the
 * same plan.json without id collisions.
 */
export function composeScenario(basePlan, scenario) {
  const out = deepClone(basePlan);
  const slug = scenario.slug;

  // 1) Re-id the plan itself
  out.id = `plan-${slug}`;
  out.name = scenario.name;
  out.active =
    scenario.slug === 'base' || scenario.slug === 'current-path' || scenario.active === true;

  // 2) Re-id every sub-entity so PL doesn't see duplicate ids across plans
  for (const m of out.milestones || []) {
    if (m.id) m.id = `${m.id}-${slug}`;
  }
  for (const key of ['income', 'expenses', 'accounts', 'assets']) {
    for (const ev of out[key]?.events || []) {
      if (ev.id) ev.id = `${ev.id}-${slug}`;
      for (const refKey of ['start', 'end']) {
        const r = ev[refKey];
        if (r && r.type === 'milestone') {
          r.value = `${r.value}-${slug}`;
        }
      }
    }
  }

  // 3) Apply retirement-date overrides
  const retOverrides = scenario.overrides['retirement-date'] || {};
  for (const person of Object.keys(retOverrides)) {
    const m = findMilestoneByPerson(out, person);
    if (m) {
      m.criteria = [{ type: 'year', value: retOverrides[person] }];
    }
  }

  // 4) Apply lifestyle-target override (sets / creates an expense event named "Lifestyle")
  const lt = scenario.overrides['lifestyle-target'];
  if (lt) {
    const yearly = lt.unit === 'monthly' ? lt.amount * 12 : lt.amount;
    out.expenses = out.expenses || { events: [] };
    let exp = findLifestyleExpense(out);
    if (!exp) {
      exp = {
        id: `expense-lifestyle-${slug}`,
        name: 'Lifestyle',
        type: 'expense',
        owner: 'joint',
        amountType: 'today$',
        frequency: 'yearly',
        icon: 'mdi-cart',
        start: { type: 'today', value: 'today' },
        end: { type: 'never', value: 'never' },
        yearlyChange: {
          type: 'inflation',
          amount: 0,
          amountType: 'percent',
          limitEnabled: false,
          limitType: 'today$',
          limit: 0,
        },
      };
      out.expenses.events.push(exp);
    }
    exp.amount = yearly;
    exp.amountType = 'today$';
    exp.frequency = 'yearly';
  }

  // 5) Apply state-tax-rate override — writes plan.variables.localIncomeTaxRate.
  // Convention: scenario carries the percent number directly (5.75 means 5.75%).
  const stateTaxRate = scenario.overrides['state-tax-rate'];
  if (stateTaxRate !== null && stateTaxRate !== undefined) {
    out.variables = out.variables || {};
    out.variables.localIncomeTaxRate = stateTaxRate;
  }

  // 6) Apply one-time-event overrides — emitted as account events
  for (const ev of scenario.overrides['one-time-event']) {
    out.accounts = out.accounts || { events: [] };
    const signedAmt = ev.direction === 'in' ? ev.amount : -ev.amount;
    out.accounts.events.push({
      id: `account-event-${slug}-${ev.account}-${ev.date}`,
      name: `${ev.direction === 'in' ? 'Windfall' : 'Withdrawal'} to ${ev.account}`,
      type: 'one-time',
      accountId: `acct-${ev.account}`,
      amount: signedAmt,
      amountType: 'today$',
      icon: ev.direction === 'in' ? 'mdi-gift' : 'mdi-cash-remove',
      start: { type: 'year', value: ev.date },
      end: { type: 'year', value: ev.date },
    });
  }

  return out;
}

/**
 * Compose every parsed scenario into a list of PL plans.
 * If no scenarios are present, returns null so emit() can fall back.
 */
export function composeScenarioPlans(basePlan, scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) return null;
  if (!basePlan)
    throw new Error('composeScenarioPlans: basePlan is required when scenarios are present');
  const plans = scenarios.map((s) => composeScenario(basePlan, s));
  // Ensure exactly one plan is active (default to the first if nothing marked).
  const activeCount = plans.filter((p) => p.active).length;
  if (activeCount === 0 && plans.length > 0) plans[0].active = true;
  return plans;
}

// Re-export days-helper for testing scenario date math (used by composers later).
export const _internals = { MS_PER_DAY };
