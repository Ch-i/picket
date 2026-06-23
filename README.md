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

### Use it from Claude Desktop / Claude Code

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
| `@picket/web` | Ember + Lit analyst console *(in progress)* |

## Status

- [x] Domain model + pluggable adapter (demo + REST)
- [x] MCP server with read tools + guarded write tools
- [ ] Ember Octane shell + Lit components (alert table, rule editor)
- [ ] In-app LLM assistant wired to the MCP tools
