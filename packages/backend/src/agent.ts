import type Anthropic from "@anthropic-ai/sdk";
import type { McpBridge } from "./mcp.js";

const MODEL = process.env.PICKET_MODEL ?? "claude-opus-4-8";
const EFFORT = process.env.PICKET_EFFORT ?? "medium";
const MAX_ITERS = 8;

const SYSTEM = `You are Picket — a security analyst assistant embedded in a pfSense IDS/IPS console (Suricata + Snort).

Use the ids_* tools to investigate the live alert feed, rules, and interfaces before answering. Ground every claim in a tool result rather than assumption. Be concise and instrument-like: lead with the finding, then the supporting detail.

Changes are human-gated:
- For any change (ids_toggle_rule, ids_suppress_alert), FIRST call the tool WITHOUT confirm — a dry-run — to preview exactly what would change, explain the impact, and ask the user to approve.
- Only call the tool again with confirm:true AFTER the user has explicitly approved in their next message.
- Never apply a change the user has not explicitly approved.

Keep responses tight. Don't narrate routine tool calls; state what you found and what you recommend.`;

// When authenticating with a Claude Code subscription token, the API requires the
// first system block to carry the Claude Code identity.
const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";

export interface Step {
  kind: "say" | "tool";
  text?: string;
  tool?: string;
  args?: unknown;
  result?: unknown;
}

// Ephemeral per-session conversation state (fine for a single-operator box).
const sessions = new Map<string, unknown[]>();

export function resetSession(id: string) {
  sessions.delete(id);
}

/** Run one user turn through the Claude tool-use loop, returning render steps. */
export async function chat(
  anthropic: Anthropic,
  mcp: McpBridge,
  sessionId: string,
  userMessage: string,
  oauth = false,
): Promise<Step[]> {
  const messages = sessions.get(sessionId) ?? [];
  messages.push({ role: "user", content: userMessage });

  // OAuth (Claude Code subscription) needs the identity as the first system block.
  const system = oauth
    ? [
        { type: "text", text: CLAUDE_CODE_IDENTITY },
        { type: "text", text: SYSTEM },
      ]
    : SYSTEM;

  const steps: Step[] = [];

  for (let i = 0; i < MAX_ITERS; i++) {
    const req = {
      model: MODEL,
      max_tokens: 16000,
      system,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT },
      tools: mcp.tools,
      messages,
    };
    // Cast: adaptive thinking / output_config may outpace the installed SDK types.
    const resp = (await anthropic.messages.create(
      req as never,
    )) as Anthropic.Message;

    messages.push({ role: "assistant", content: resp.content });

    const toolUses: { id: string; name: string; input: Record<string, unknown> }[] = [];
    for (const block of resp.content) {
      if (block.type === "text" && block.text.trim()) {
        steps.push({ kind: "say", text: block.text });
      } else if (block.type === "tool_use") {
        toolUses.push({
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }

    if (resp.stop_reason !== "tool_use") break;

    const toolResults = [];
    for (const tu of toolUses) {
      let text: string;
      try {
        text = await mcp.call(tu.name, tu.input);
      } catch (e) {
        text = `ERROR: ${(e as Error)?.message ?? e}`;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      steps.push({ kind: "tool", tool: tu.name, args: tu.input, result: parsed });
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: text });
    }
    messages.push({ role: "user", content: toolResults });
  }

  sessions.set(sessionId, messages);
  return steps;
}
