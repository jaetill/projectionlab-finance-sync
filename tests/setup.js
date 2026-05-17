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

export function makePluginApiStub(overrides = {}) {
  return {
    getAccounts: vi.fn(async () => []),
    setAccount: vi.fn(async (account) => account),
    deleteAccount: vi.fn(async () => true),
    getMilestones: vi.fn(async () => []),
    setMilestone: vi.fn(async (milestone) => milestone),
    getIncomes: vi.fn(async () => []),
    setIncome: vi.fn(async (income) => income),
    getExpenses: vi.fn(async () => []),
    setExpense: vi.fn(async (expense) => expense),
    ...overrides,
  };
}

beforeEach(() => {
  resetStorage();
  vi.clearAllMocks();
});
