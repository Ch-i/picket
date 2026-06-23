import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

export interface McpBridge {
  /** Tools in Anthropic tool-definition shape (MCP JSON Schema maps 1:1). */
  tools: { name: string; description: string; input_schema: unknown }[];
  call(name: string, args: Record<string, unknown>): Promise<string>;
  close(): Promise<void>;
}

/**
 * Spawn the @picket/mcp server over stdio and expose its tools. The IDS
 * backend selection (demo vs live pfSense) and the write gate flow into the
 * subprocess via the inherited environment, so this layer is backend-agnostic.
 */
export async function connectMcp(): Promise<McpBridge> {
  const serverPath =
    process.env.PICKET_MCP_PATH ??
    fileURLToPath(new URL("../../mcp-server/dist/index.js", import.meta.url));

  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined),
  ) as Record<string, string>;

  const transport = new StdioClientTransport({
    command: process.execPath, // node
    args: [serverPath],
    env,
  });

  const client = new Client({ name: "picket-backend", version: "0.1.0" });
  await client.connect(transport);

  const listed = await client.listTools();
  const tools = listed.tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema,
  }));

  return {
    tools,
    async call(name, args) {
      const r = await client.callTool({ name, arguments: args });
      const content = (r.content ?? []) as { type: string; text?: string }[];
      return content
        .map((c) => (c.type === "text" ? (c.text ?? "") : JSON.stringify(c)))
        .join("\n");
    },
    async close() {
      await client.close();
    },
  };
}
