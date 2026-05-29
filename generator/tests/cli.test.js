import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// PR-A scaffold tests. Verify the scaffold exists and modules are loadable.
// Real behavior tests for each subcommand land alongside their implementations.
// (Memo parsing moved from a stub to a real implementation in PR-B; see
// memo-parse.test.js for that coverage.)

describe('generator scaffold', () => {
  it('has the expected directory structure', () => {
    const root = resolve(import.meta.dirname, '..');
    const paths = [
      'README.md',
      'config/reconcile-rules.json',
      'src/cli.js',
      'src/sources/memo.js',
      'src/sources/actual.js',
      'src/sources/manual.js',
      'src/reconcile.js',
      'src/emit.js',
    ];
    for (const p of paths) {
      expect(existsSync(resolve(root, p)), `missing: ${p}`).toBe(true);
    }
  });

  it('modules import without throwing', async () => {
    await expect(import('../src/sources/memo.js')).resolves.toBeDefined();
    await expect(import('../src/sources/actual.js')).resolves.toBeDefined();
    await expect(import('../src/sources/manual.js')).resolves.toBeDefined();
    await expect(import('../src/reconcile.js')).resolves.toBeDefined();
    await expect(import('../src/emit.js')).resolves.toBeDefined();
  });

  it('all sub-module exports are now implemented (no stubs left)', async () => {
    // PR-B through PR-E. Each has its own *.test.js with full coverage.
    const memo = await import('../src/sources/memo.js');
    const actual = await import('../src/sources/actual.js');
    const recon = await import('../src/reconcile.js');
    const emitMod = await import('../src/emit.js');
    expect(typeof memo.parseMemo).toBe('function');
    expect(typeof actual.fetchActualSnapshot).toBe('function');
    expect(typeof recon.reconcile).toBe('function');
    expect(typeof emitMod.emit).toBe('function');
  });

  it('manual source returns empty array (no entries yet)', async () => {
    const { getManualEntries } = await import('../src/sources/manual.js');
    await expect(getManualEntries()).resolves.toEqual([]);
  });

  it('reconcile-rules.json parses and has expected top-level keys', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = resolve(import.meta.dirname, '..', 'config/reconcile-rules.json');
    const data = JSON.parse(await readFile(path, 'utf8'));
    expect(data.schemaVersion).toBe(1);
    expect(data.sourcePriority).toBeDefined();
    expect(data.driftThresholds).toBeDefined();
    expect(data.accountMapping).toBeDefined();
  });

  it('falls back to MEMO_PATH env var when --memo flag is omitted', async () => {
    const { spawnSync } = await import('node:child_process');
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'cli-memo-env-'));
    const memoPath = join(dir, 'memo.md');
    const stubMemo = [
      '# stub',
      '',
      '## Assets',
      '',
      '| Account | Balance | Notes |',
      '| ------- | ------- | ----- |',
      '| Stub    | $0      | x     |',
      '',
      '## Income Picture (Monthly)',
      '',
      '| Source | Amount | Notes |',
      '| ------ | ------ | ----- |',
      '| Salary | $1     | x     |',
      '',
    ].join('\n');
    await writeFile(memoPath, stubMemo);
    try {
      const cliPath = resolve(import.meta.dirname, '..', 'src/cli.js');
      // Clear Actual env so 'check' stops after memo OK without failing on
      // unreachable Actual server.
      const env = { ...process.env, MEMO_PATH: memoPath };
      delete env.ACTUAL_PASSWORD;
      delete env.ACTUAL_BUDGET_NAME;
      const result = spawnSync('node', [cliPath, 'check'], { env, encoding: 'utf8' });
      expect(result.stderr).not.toMatch(/--memo.*required/);
      expect(result.stdout).toMatch(/memo OK/);
      expect(result.status).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
