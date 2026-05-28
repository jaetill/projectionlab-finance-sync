import { afterEach, describe, expect, it } from 'vitest';
import { formatResult, renderStatusPanel } from '../../userscript/src/ui.js';

afterEach(() => {
  const panel = document.getElementById('pl-sync-status-panel');
  if (panel) panel.remove();
  const style = document.getElementById('pl-sync-status-panel-style');
  if (style) style.remove();
});

describe('formatResult', () => {
  it('returns the "no sync yet" placeholder when null', () => {
    expect(formatResult(null)).toContain('No sync yet');
  });

  it('renders an OK header for a successful result', () => {
    const html = formatResult({ ok: true, steps: [], warnings: [], errors: [] });
    expect(html).toContain('OK');
    expect(html).toContain('class="ok"');
  });

  it('renders each step with success/failure marks', () => {
    const html = formatResult({
      ok: false,
      steps: [
        { name: 'validate-api-key', ok: true, durationMs: 12 },
        { name: 'export-data', ok: false, durationMs: 5 },
      ],
      errors: [{ scope: 'export-data', message: 'boom' }],
      warnings: [],
    });
    expect(html).toContain('✅ validate-api-key');
    expect(html).toContain('❌ export-data');
    expect(html).toContain('(12ms)');
  });

  it('escapes HTML in error messages', () => {
    const html = formatResult({
      ok: false,
      steps: [],
      errors: [{ scope: 's', message: '<script>alert(1)</script>' }],
      warnings: [],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('caps displayed errors at 3', () => {
    const result = {
      ok: false,
      steps: [],
      warnings: [],
      errors: Array.from({ length: 10 }, (_, i) => ({ scope: 's' + i, message: 'm' + i })),
    };
    const html = formatResult(result);
    expect((html.match(/<li>/g) || []).length).toBeLessThanOrEqual(3);
  });
});

describe('renderStatusPanel', () => {
  it('mounts a panel into the document', () => {
    renderStatusPanel({
      hasApiKey: true,
      hasPlan: false,
      hasRollback: false,
      lastSyncAt: null,
      lastResult: null,
    });
    const panel = document.getElementById('pl-sync-status-panel');
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('ProjectionLab Finance Sync');
  });

  it('reflects state in the header rows', () => {
    renderStatusPanel({
      hasApiKey: true,
      hasPlan: true,
      hasRollback: true,
      lastSyncAt: '2026-05-18T10:00:00Z',
      lastResult: null,
    });
    const panel = document.getElementById('pl-sync-status-panel');
    expect(panel.textContent).toContain('2026-05-18T10:00:00Z');
    expect(panel.textContent).toContain('Rollback ready');
    expect(panel.textContent).toContain('yes');
  });

  it('updates in place on re-render (does not create a second panel)', () => {
    renderStatusPanel({
      hasApiKey: false,
      hasPlan: false,
      hasRollback: false,
      lastSyncAt: null,
      lastResult: null,
    });
    renderStatusPanel({
      hasApiKey: true,
      hasPlan: true,
      hasRollback: false,
      lastSyncAt: 'now',
      lastResult: null,
    });
    expect(document.querySelectorAll('#pl-sync-status-panel').length).toBe(1);
  });

  it('returns null when given no document (Node-only context)', () => {
    expect(renderStatusPanel({ hasApiKey: false, hasPlan: false }, null)).toBeNull();
  });
});
