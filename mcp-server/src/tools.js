/**
 * Tool definitions for the projectionlab-finance-sync MCP server.
 *
 * Each tool: name + description + JSON schema + handler.
 * Handlers receive `args` (validated against the schema) plus an `impl`
 * (the generator implementation; injectable for tests).
 *
 * Scope (PR-J scaffold): tool surface + handler shells + a tiny composeOverrides
 * helper that turns MCP-shape scenario overrides into the format scenarios.js
 * composeScenario() consumes. Real wire-up to the MCP SDK is in index.js.
 */

/**
 * Resolve a memo path from args or env. Required for every tool.
 */
export function resolveMemoPath(args, env) {
  const path = args?.memoPath || env?.MEMO_PATH;
  if (!path) {
    throw new Error(
      'memoPath required (pass in tool args OR set MEMO_PATH env var in the MCP server config)',
    );
  }
  return path;
}

/**
 * Convert an MCP-supplied scenario_overrides argument into a Scenario object
 * suitable for scenarios.composeScenario().
 *
 * Input shape (MCP):
 *   [
 *     { name, overrides: {
 *         'retirement-date': { jason?, heidi? },
 *         'lifestyle-target': { mode: 'absolute', amount, unit },
 *         'one-time-event': [{ direction, amount, account, date }],
 *         effective?: 'YYYY-MM-DD',
 *     } }
 *   ]
 *
 * Output: same shape parseScenarios() emits — name, slug, effective, overrides.
 */
export function composeOverrides(scenarioOverrides) {
  if (!Array.isArray(scenarioOverrides)) return [];
  return scenarioOverrides.map((s) => ({
    name: s.name || 'whatif',
    slug: (s.name || 'whatif')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, ''),
    effective: s.effective || null,
    overrides: {
      'lifestyle-target': s.overrides?.['lifestyle-target'] || null,
      'retirement-date': s.overrides?.['retirement-date'] || {},
      'one-time-event': s.overrides?.['one-time-event'] || [],
    },
  }));
}

/**
 * Tool definitions. Each handler receives (args, ctx) where ctx = { env, impl }.
 * impl is the generator implementation; ctx.env is the server env (for MEMO_PATH).
 */
export const TOOLS = [
  {
    name: 'generate_plan',
    description:
      'Run the full generator pipeline (parseMemo + fetchActualSnapshot + reconcile + emit). With scenario_overrides, runs ad-hoc what-ifs without persisting to the memo or overwriting data/plan.json (dry-run forced when overrides supplied).',
    inputSchema: {
      type: 'object',
      properties: {
        memoPath: {
          type: 'string',
          description: 'Path to jason_finance.md. Defaults to MEMO_PATH env if unset.',
        },
        scenarioOverrides: {
          type: 'array',
          description:
            'Ephemeral scenarios to compose on top of the base memo. When supplied, plan.json is NOT written; output returned in the tool result.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              effective: { type: 'string' },
              overrides: {
                type: 'object',
                properties: {
                  'lifestyle-target': { type: 'object' },
                  'retirement-date': { type: 'object' },
                  'one-time-event': { type: 'array' },
                },
              },
            },
            required: ['name'],
          },
        },
        dryRun: {
          type: 'boolean',
          description:
            'Force --dry-run (no write to data/plan.json). Auto-true when overrides supplied.',
        },
      },
    },
    async handler(args, ctx) {
      const memoPath = resolveMemoPath(args, ctx.env);
      const overrides = composeOverrides(args.scenarioOverrides);
      const dryRun = args.dryRun || overrides.length > 0;
      const result = await ctx.impl.runPipeline({
        memoPath,
        ephemeralScenarios: overrides,
        dryRun,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                summary: {
                  accountsCount: result.reconciled.accounts.length,
                  driftCount: result.reconciled.drift.length,
                  scenarioCount: result.reconciled.scenarios?.length || 0,
                  ephemeralCount: overrides.length,
                  written: result.emit?.written || false,
                  outputPath: result.emit?.path || null,
                },
                drift: result.driftMarkdown,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },
  {
    name: 'get_drift',
    description:
      'Run the pipeline without emitting plan.json; return the drift report markdown. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        memoPath: { type: 'string' },
      },
    },
    async handler(args, ctx) {
      const memoPath = resolveMemoPath(args, ctx.env);
      const result = await ctx.impl.runPipeline({ memoPath, includeEmit: false });
      return {
        content: [{ type: 'text', text: result.driftMarkdown || '(no drift)' }],
      };
    },
  },
  {
    name: 'check',
    description:
      'Validate memo parsing + Actual auth without running reconciliation or emit. Fast sanity check.',
    inputSchema: {
      type: 'object',
      properties: {
        memoPath: { type: 'string' },
      },
    },
    async handler(args, ctx) {
      const memoPath = resolveMemoPath(args, ctx.env);
      const result = await ctx.impl.check({ memoPath });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    },
  },
  {
    name: 'query_account',
    description:
      'Look up one account by name from the live Actual snapshot (case-insensitive substring match). No memo touch. Returns balance, type, last-reconciled.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Account display-name substring to match' },
      },
      required: ['name'],
    },
    async handler(args, ctx) {
      const snapshot = await ctx.impl.actualSnapshot();
      const target = (args.name || '').toLowerCase();
      const matches = (snapshot.accounts || []).filter((a) =>
        (a.name || '').toLowerCase().includes(target),
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ matchCount: matches.length, accounts: matches }, null, 2),
          },
        ],
      };
    },
  },
];
