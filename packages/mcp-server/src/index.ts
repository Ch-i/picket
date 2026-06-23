#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAdapter } from "@picket/client";
import { registerTools } from "./tools.js";

const adapter = createAdapter();

const server = new McpServer({
  name: "picket-ids",
  version: "0.1.0",
});

registerTools(server, adapter);

const transport = new StdioServerTransport();
await server.connect(transport);

// MCP speaks JSON-RPC over stdout; keep human logs on stderr.
console.error(
  `[picket-mcp] ready — backend=${adapter.mode}, writes=${process.env.PICKET_ALLOW_WRITES === "1" ? "enabled" : "disabled"}`,
);
