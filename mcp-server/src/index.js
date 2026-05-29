#!/usr/bin/env node
/**
 * MCP server entrypoint — stdio transport.
 *
 * Wires the TOOLS list (src/tools.js) into the MCP SDK's Server + ListTools /
 * CallTool handlers, then runs the stdio loop. defaultImpl (src/impl.js) does
 * the actual generator work.
 *
 * To attach to a Claude client, see mcp-server/README.md.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { TOOLS } from './tools.js';
import { defaultImpl } from './impl.js';

function buildServer(impl = defaultImpl) {
  const server = new Server(
    { name: 'projectionlab-finance-sync', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = TOOLS.find((t) => t.name === request.params.name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }
    try {
      return await tool.handler(request.params.arguments || {}, {
        env: process.env,
        impl,
      });
    } catch (err) {
      return {
        content: [{ type: 'text', text: `${tool.name} failed: ${err.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export { buildServer };

// Run the server when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = buildServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    process.stderr.write(`mcp-server: failed to start: ${err.message}\n`);
    process.exit(1);
  });
}
