# Picket

**LLM-native IDS/IPS console for pfSense** — manage Suricata & Snort alerts and rules
from a data-dense web UI *and* from any LLM, over a shared MCP tool surface.

> Built with **Ember Octane** + **Lit web components** on the front, a **Model Context
> Protocol** server on the back, and a pluggable pfSense adapter in between. Runs
> standalone on bundled demo data; points at a real pfSense box when you have one.

## Why

A SOC analyst staring at thousands of Suricata/Snort alerts spends most of their time
on triage and tuning: *which of these matter, and how do I quiet the noise without going
blind?* Picket turns that loop into a conversation — the same IDS operations are exposed
as MCP tools, so an LLM can list, correlate, explain, and (with approval) suppress or
toggle rules, while the Ember/Lit console keeps a human in control.

## Architecture

```
                 ┌─────────────────────────────┐
                 │  apps/web  (Ember Octane)    │
                 │  embeds Lit web components   │
                 │  • alert table  • rule editor│
                 │  • assistant (LLM chat)      │
                 └───────────────┬─────────────┘
                                 │  MCP (stdio / HTTP)
                 ┌───────────────▼─────────────┐
                 │  @picket/mcp                 │  ids_list_alerts, ids_list_rules,
                 │  MCP server (TypeScript)     │  ids_stats, ids_toggle_rule,
                 └───────────────┬─────────────┘  ids_suppress_alert …
                                 │
                 ┌───────────────▼─────────────┐
                 │  @picket/client              │  IdsAdapter
                 │  DemoAdapter | PfSenseRest   │
                 └──────────────────────────────┘
```

The web app and the MCP server depend only on the `IdsAdapter` interface — never on a
concrete backend — so the same tools drive demo fixtures or a live pfSense.

## Safety model (writes are deliberately hard)

Mutations (toggling rules, adding suppressions) are guarded twice:

1. **Tool layer** — writes are *dry-run by default*; the LLM must re-call with
   `confirm: true` to apply.
2. **Adapter layer** — even a confirmed write throws unless `PICKET_ALLOW_WRITES=1`.

So an agent cannot silently reconfigure your firewall.

## Quickstart

```bash
pnpm install
pnpm build
pnpm selftest          # prove the data layer (demo backend)
pnpm mcp               # run the MCP server on stdio
```

Point at a real box:

```bash
export PICKET_BACKEND=pfsense
export PICKET_PFSENSE_URL=https://pfsense.lan
export PICKET_PFSENSE_KEY=…           # pfSense REST API token
export PICKET_ALLOW_WRITES=1          # opt in to mutations
```

## Boot from zero

Hand an empty box (Linux / WSL2, ~2 GB RAM) a single command and get a running console.

**Docker (any box with Docker):**
```bash
git clone https://github.com/Ch-i/picket.git && cd picket
cp packages/backend/.env.example packages/backend/.env   # optional — add ANTHROPIC_API_KEY for live mode
docker compose up -d --build                              # http://<box>:8200
```

**Bare metal / WSL (no Docker):** the bootstrap installs Node 22 + pnpm + git if missing, clones, builds, seeds `.env`, and runs:
```bash
curl -fsSL https://raw.githubusercontent.com/Ch-i/picket/main/bootstrap.sh | bash
#   ./bootstrap.sh --service   # install + enable a systemd service instead of running foreground
```

Either way the box serves the **demo with no secrets**; it flips to **live Claude** the moment
`packages/backend/.env` carries an `ANTHROPIC_API_KEY`, and to a **live pfSense feed** when you set
`PICKET_BACKEND` (see below). Secrets live only in that `.env` — never in the image or the repo.

## Live mode — the ll0d backend (real Claude)

The public demo runs a **scripted agent over fixtures, with no API key** (so it's safe on
GitHub Pages). To run the *real* assistant — Claude driving the MCP tools against a live
pfSense — use the backend, which runs on a box you control (e.g. `ll0d`, where the firewall
is wired):

```bash
cd packages/backend
cp .env.example .env        # then fill in ANTHROPIC_API_KEY (lives ONLY here)
cd ../.. && pnpm build
pnpm serve                  # http://localhost:8200  — serves the console + /api/chat
```

```
Browser ──/api/chat──▶ @picket/backend ──reads ANTHROPIC_API_KEY from .env (gitignored)
                            │  Claude tool-use loop (manual, write-gated)
                            ▼  spawns + speaks MCP (stdio)
                      @picket/mcp ──▶ @picket/client ──▶ demo fixtures | live pfSense
```

- **The key never leaves the backend** — not committed, not bundled to the browser, not on Pages.
- The frontend auto-detects the backend (`GET /api/health`) and switches from the demo agent to
  `/api/chat`; with no backend it stays in the safe demo.
- **Writes stay human-gated end to end:** Claude is instructed to dry-run any rule toggle /
  suppression and wait for your explicit approval, and the adapter still requires
  `PICKET_ALLOW_WRITES=1` to mutate the box.
- Point at a real firewall by setting `PICKET_BACKEND=pfsense` + `PICKET_PFSENSE_URL/KEY` in the
  same `.env`.

Model defaults to `claude-opus-4-8` with adaptive thinking (override via `PICKET_MODEL` / `PICKET_EFFORT`).

### Use it from any MCP client

```json
{
  "mcpServers": {
    "picket": { "command": "node", "args": ["packages/mcp-server/dist/index.js"] }
  }
}
```

## Packages

| package | what |
|---|---|
| `@picket/client` | pfSense IDS adapter — demo fixtures or live REST |
| `@picket/mcp` | MCP server exposing the IDS tools |
| `@picket/backend` | Claude tool-use loop over MCP + static host (the `ll0d` live instance) |
| `picket-web` | Ember Octane + Lit analyst console |

## Status

- [x] Domain model + pluggable adapter (demo + REST)
- [x] MCP server with read tools + guarded write tools
- [x] Ember Octane shell + Lit alert table
- [x] In-app LLM assistant — demo agent (Pages) + live Claude tool-use loop via the backend
- [ ] Live pfSense REST adapter validated against a real box
- [ ] Rule-editor Lit component
