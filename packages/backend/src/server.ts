#!/usr/bin/env node
import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, normalize } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { discoverHosts } from "@picket/client";
import { connectMcp } from "./mcp.js";
import { chat } from "./agent.js";

// Load .env if present (Node >= 20.12). The key lives here, never in the repo.
try {
  (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(".env");
} catch {
  /* no .env — env may come from the shell */
}

const PORT = Number(process.env.PICKET_PORT ?? 8200);
const MODEL = process.env.PICKET_MODEL ?? "claude-opus-4-8";
const STATIC_DIR =
  process.env.PICKET_STATIC ??
  fileURLToPath(new URL("../../../apps/web/dist", import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/json",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
};

function json(res: ServerResponse, code: number, obj: unknown) {
  res.writeHead(code, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(obj));
}

const mcp = await connectMcp();
const hasKey = !!process.env.ANTHROPIC_API_KEY;
// Construct only when a key exists — the SDK throws at construction otherwise,
// and we still want /api/health + static hosting to work without one.
const anthropic = hasKey ? new Anthropic() : null;
const writes = process.env.PICKET_ALLOW_WRITES === "1";
console.error(`[picket-backend] MCP tools: ${mcp.tools.map((t) => t.name).join(", ")}`);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    return res.end();
  }

  if (url.pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      model: MODEL,
      hasKey,
      writes,
      tools: mcp.tools.map((t) => t.name),
    });
  }

  if (url.pathname === "/api/hosts") {
    try {
      return json(res, 200, { hosts: await discoverHosts() });
    } catch (e) {
      return json(res, 500, { error: String((e as Error)?.message ?? e) });
    }
  }

  if (url.pathname === "/api/chat" && req.method === "POST") {
    if (!hasKey) return json(res, 503, { error: "ANTHROPIC_API_KEY not set on the backend" });
    let body = "";
    for await (const c of req) body += c;
    let parsed: { sessionId?: string; message?: string };
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      return json(res, 400, { error: "invalid JSON" });
    }
    const sessionId = String(parsed.sessionId ?? "default");
    const message = String(parsed.message ?? "").trim();
    if (!message) return json(res, 400, { error: "empty message" });
    try {
      const steps = await chat(anthropic!, mcp, sessionId, message);
      return json(res, 200, { steps });
    } catch (e) {
      console.error(e);
      return json(res, 500, { error: String((e as Error)?.message ?? e) });
    }
  }

  // static file host (so the whole console runs from this one process on ll0d)
  let p = url.pathname === "/" ? "/index.html" : url.pathname;
  p = normalize(p).replace(/^(\.\.[/\\])+/, "");
  try {
    const data = await readFile(join(STATIC_DIR, p));
    res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" });
    return res.end(data);
  } catch {
    try {
      const html = await readFile(join(STATIC_DIR, "index.html"));
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(html);
    } catch {
      return json(res, 404, { error: "not found" });
    }
  }
});

server.listen(PORT, () =>
  console.error(
    `[picket-backend] http://localhost:${PORT}  model=${MODEL}  key=${hasKey ? "set" : "MISSING"}  writes=${writes ? "on" : "off"}`,
  ),
);

process.on("SIGINT", async () => {
  await mcp.close();
  process.exit(0);
});
