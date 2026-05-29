# `mcp-server/` — MCP server wrapping the generator

**Status:** PR-J scaffold. Tools defined, hand-off plumbing in place, not yet deployed to any Claude client.

## What this is

A Model Context Protocol (MCP) server that exposes the Phase 3 generator as four tools Claude can call from chat:

| Tool            | What it does                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `generate_plan` | Run the full pipeline: parseMemo → fetchActualSnapshot → reconcile → emit. Optional `scenario_overrides` for ephemeral what-ifs. |
| `get_drift`     | Reconcile without emitting; return the drift report markdown.                                                                    |
| `check`         | Validate memo parsing + Actual auth; no writes, no reconciliation.                                                               |
| `query_account` | Direct read of one account from Actual (no memo touch).                                                                          |

## Architecture

```
Claude chat ──MCP stdio──► mcp-server/src/index.js
                                    │
                                    ▼
                       generator/src/* (imported in-process)
                                    │
                                    ▼
                       jason_finance.md + Actual Budget API
                                    │
                                    ▼
                       returns markdown / structured JSON
```

The MCP server is a thin shim. All real logic lives in `generator/`. The shim:

1. Receives an MCP tool call (e.g., `generate_plan({ memoPath, scenarioOverrides? })`)
2. Constructs an opts object the generator's exported functions expect
3. Invokes the generator function
4. Wraps the result in MCP's response format

## Ephemeral scenario overrides

The killer feature this enables: Claude can compose ad-hoc scenarios at call time without persisting them to the memo.

```
User: "What would my plan look like if I retire at 53 AND spending is $11k AND we inherit $500k?"

Claude: [calls generate_plan with:
  scenario_overrides: [
    { name: 'whatif-53-11k-500k',
      overrides: {
        'retirement-date': { jason: '2028-04-01' },
        'lifestyle-target': { mode: 'absolute', amount: 11000, unit: 'monthly' },
        'one-time-event': [
          { direction: 'in', amount: 500000, account: 'vanguard-brokerage', date: '2030-01-01' }
        ]
      }}
  ]
]

→ Generator composes the scenario in memory, emits a plan, returns drift + plan summary.
→ Nothing persisted. No memo edit. No data/plan.json overwrite.
```

This is what PR-K was designed to support: the lever set is the same as the memo's `## Scenarios`, just supplied at call time instead of read from the memo.

## Deferred

PR-J ships the scaffold. Not in this PR:

- **Connecting to a Claude client.** The MCP SDK supports stdio and SSE transports. Wiring to Claude Desktop / Cowork is a separate operational step (`claude_desktop_config.json` entry).
- **Persistent server.** Currently the server is invoked per-call by the client. A long-running server with caching (memo SHA → parsed cache, Actual snapshot cache, etc.) is a v2 optimization.
- **Write tools.** Currently read-only via `generate_plan` + `get_drift` + `check` + `query_account`. Tools that _write back_ to the memo (e.g., `update_lifestyle_target($X)`) are explicitly out of scope per the memo-source-of-truth design.
- **Auth.** Local-only MCP via stdio doesn't need it. If we expose SSE later, add token auth.

## Wiring to Claude Desktop (future)

`%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pl-finance-sync": {
      "command": "node",
      "args": [
        "E:\\Users\\tille\\Documents\\Source Code\\projectionlab-finance-sync\\mcp-server\\src\\index.js"
      ],
      "env": {
        "ACTUAL_PASSWORD": "...",
        "ACTUAL_BUDGET_NAME": "Tilley Household",
        "MEMO_PATH": "E:\\Users\\tille\\Documents\\Claude\\Projects\\Financial Decisions and Planning\\jason_finance.md"
      }
    }
  }
}
```

Then restart Claude Desktop. The four tools should appear in the MCP tools menu.

## Tests

Tests use dependency injection — the MCP server takes a `generatorImpl` parameter (defaults to the real generator). Tests pass a fake that returns canned responses, so we don't need a running Actual server or a real memo to test the shim.
