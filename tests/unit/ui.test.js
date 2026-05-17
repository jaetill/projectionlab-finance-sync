import { describe, expect, it } from 'vitest';
import { formatResult, renderStatusPanel } from '../../userscript/src/ui.js';

describe('formatResult', () => {
  it('handles a missing result', () => {
    expect(formatResult(null)).toContain('No sync yet');
  });

  it('renders ok counts', () => {
    const html = formatResult({
      ok: true,
      counts: { accounts: 2, income: 1, expenses: 1, milestones: 0 },
    });
    expect(html).toContain('OK');
    expect(html).toContain('2 accounts');
  });

  it('renders errors and unresolved warnings', () => {
    const html = formatResult({
      ok: false,
      counts: { accounts: 0 },
      unresolved: [{ kind: 'account', name: 'Mystery Account' }],
      errors: [{ scope: 'getAccounts', message: 'boom' }],
    });
    expect(html).toContain('Errors');
    expect(html).toContain('Unresolved: 1');
    expect(html).toContain('getAccounts: boom');
  });
});

describe('renderStatusPanel', () => {
  it('mounts the panel into document.body and updates on re-render', () => {
    const panel = renderStatusPanel({ hasApiKey: false, hasPlan: false, lastSyncAt: null });
    expect(panel).not.toBeNull();
    expect(document.getElementById('pl-sync-status-panel')).toBe(panel);
    expect(panel.innerHTML).toContain('missing');

    renderStatusPanel({ hasApiKey: true, hasPlan: true, lastSyncAt: '2026-05-11T00:00:00Z' });
    const reused = document.getElementById('pl-sync-status-panel');
    expect(reused.innerHTML).toContain('set ✅');
  });
});
