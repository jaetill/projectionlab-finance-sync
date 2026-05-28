import { beforeEach, vi } from 'vitest';

const storage = new Map();

function resetStorage() {
  storage.clear();
}

globalThis.GM_getValue = vi.fn((key, defaultValue) =>
  storage.has(key) ? storage.get(key) : defaultValue,
);
globalThis.GM_setValue = vi.fn((key, value) => {
  storage.set(key, value);
});
globalThis.GM_deleteValue = vi.fn((key) => {
  storage.delete(key);
});
globalThis.GM_listValues = vi.fn(() => Array.from(storage.keys()));
globalThis.GM_registerMenuCommand = vi.fn(() => 0);
globalThis.GM_unregisterMenuCommand = vi.fn();
globalThis.GM_addStyle = vi.fn();
globalThis.GM_notification = vi.fn();
globalThis.GM_info = { script: { version: '0.0.0-test' } };

// happy-dom provides window/document; expose unsafeWindow as an alias for tests.
globalThis.unsafeWindow = globalThis.window;

// Mirrors the 7 real PL Plugin API methods (per docs/pl-api-cheatsheet.md).
export function makePluginApiStub(overrides = {}) {
  return {
    validateApiKey: vi.fn(async () => undefined),
    exportData: vi.fn(async () => ({
      meta: { version: '4.6.0', lastUpdated: 0 },
      today: { savingsAccounts: [], investmentAccounts: [], debts: [], assets: [] },
      plans: [],
      progress: {},
      settings: {},
    })),
    updateAccount: vi.fn(async () => undefined),
    restoreCurrentFinances: vi.fn(async () => undefined),
    restorePlans: vi.fn(async () => undefined),
    restoreProgress: vi.fn(async () => undefined),
    restoreSettings: vi.fn(async () => undefined),
    ...overrides,
  };
}

// A minimal-but-valid plan that passes the structural validator. Tests can
// shallow-merge overrides on top.
export function makeValidPlan(overrides = {}) {
  return {
    today: {
      schema: 4.6,
      partnerStatus: 'single',
      age: 50,
      birthYear: 1976,
      birthMonth: 1,
      savingsAccounts: [{ id: 'a1', name: 'HYSA', type: 'savings', balance: 50000 }],
      investmentAccounts: [{ id: 'b1', name: 'IRA', type: 'ira', balance: 250000 }],
      debts: [],
      assets: [],
      ...overrides.today,
    },
    plans: overrides.plans || [
      {
        id: 'plan-1',
        name: 'Current',
        milestones: [
          { id: 'm1', name: 'Retirement', criteria: [{ type: 'year', value: '2040-01-01' }] },
        ],
        income: { events: [] },
        expenses: { events: [] },
      },
    ],
  };
}

beforeEach(() => {
  resetStorage();
  vi.clearAllMocks();
});
