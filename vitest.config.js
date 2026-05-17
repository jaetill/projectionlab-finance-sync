import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['userscript/src/**/*.js'],
      exclude: ['userscript/build.js', 'userscript/header.template.js'],
      // Tiered thresholds per ADR-0004 (critical 90/80, default 80/70, utility 60/50).
      // Default tier here; per-file overrides set tighter targets for sync.js + auth.js
      // and looser targets for UI helpers once those files exist.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
        'userscript/src/sync.js': {
          lines: 90,
          functions: 90,
          branches: 80,
          statements: 90,
        },
        'userscript/src/auth.js': {
          lines: 90,
          functions: 90,
          branches: 80,
          statements: 90,
        },
        'userscript/src/ui.js': {
          lines: 60,
          functions: 60,
          branches: 50,
          statements: 60,
        },
      },
    },
  },
});
