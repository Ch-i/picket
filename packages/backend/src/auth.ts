import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Where Claude Code stores its subscription OAuth credential.
const CREDS = process.env.PICKET_CLAUDE_CREDS ?? join(homedir(), ".claude", ".credentials.json");
// Claude Code's public OAuth client + token endpoint (used for refresh).
const CLIENT_ID = process.env.PICKET_OAUTH_CLIENT_ID ?? "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const TOKEN_URL = process.env.PICKET_OAUTH_TOKEN_URL ?? "https://console.anthropic.com/v1/oauth/token";

export type Auth = { mode: "key" } | { mode: "oauth"; token: string };

async function readCreds(): Promise<{ oauth: any; doc: any } | null> {
  try {
    const doc = JSON.parse(await readFile(CREDS, "utf8"));
    if (doc?.claudeAiOauth?.accessToken) return { oauth: doc.claudeAiOauth, doc };
  } catch {
    /* no creds file */
  }
  return null;
}

/** Exchange the refresh token for a fresh access token and persist it. */
async function refresh(doc: any): Promise<string> {
  const o = doc.claudeAiOauth;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: o.refreshToken,
        client_id: CLIENT_ID,
      }),
    });
    if (!res.ok) return o.accessToken; // keep current; the call will surface a clear error
    const d: any = await res.json();
    doc.claudeAiOauth = {
      ...o,
      accessToken: d.access_token,
      refreshToken: d.refresh_token ?? o.refreshToken,
      expiresAt: Date.now() + (d.expires_in ?? 3600) * 1000,
    };
    try {
      await writeFile(CREDS, JSON.stringify(doc, null, 2));
    } catch {
      /* read-only creds — token still usable for this run */
    }
    return d.access_token;
  } catch {
    return o.accessToken;
  }
}

export async function getAuth(): Promise<Auth | null> {
  if (process.env.ANTHROPIC_API_KEY) return { mode: "key" };
  const c = await readCreds();
  if (!c) return null;
  let token = c.oauth.accessToken;
  if (c.oauth.expiresAt && Date.now() > c.oauth.expiresAt - 60_000) {
    token = await refresh(c.doc);
  }
  return { mode: "oauth", token };
}
