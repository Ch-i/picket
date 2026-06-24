import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createAdapter, discoverHosts, type IdsAdapter } from "@picket/client";

const engine = z.enum(["suricata", "snort"]);
const severity = z.union([z.literal(1), z.literal(2), z.literal(3)]);

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/** Register every IDS tool on the server. One adapter, shared across tools. */
export function registerTools(server: McpServer, adapter: IdsAdapter = createAdapter()) {
  server.registerTool(
    "ids_list_alerts",
    {
      title: "List IDS alerts",
      description:
        "List Suricata/Snort alerts, newest first. Filter by engine, interface, severity (1=high), recency, or free text over signature/category/IP.",
      inputSchema: {
        engine: engine.optional(),
        iface: z.string().optional(),
        severity: severity.optional(),
        sinceMinutes: z.number().int().positive().optional(),
        q: z.string().optional(),
        limit: z.number().int().positive().max(500).optional(),
      },
    },
    async (args) => json(await adapter.listAlerts(args)),
  );

  server.registerTool(
    "ids_get_alert",
    {
      title: "Get one alert",
      description: "Fetch a single alert by id, with full 5-tuple and rule metadata.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => json(await adapter.getAlert(id)),
  );

  server.registerTool(
    "ids_list_rules",
    {
      title: "List IDS rules",
      description:
        "List Suricata/Snort rules. Filter by engine, enabled state, category, or free text over the rule message.",
      inputSchema: {
        engine: engine.optional(),
        enabled: z.boolean().optional(),
        category: z.string().optional(),
        q: z.string().optional(),
        limit: z.number().int().positive().max(2000).optional(),
      },
    },
    async (args) => json(await adapter.listRules(args)),
  );

  server.registerTool(
    "ids_list_interfaces",
    {
      title: "List monitored interfaces",
      description: "List interfaces running an IDS engine, with block-offenders state and 24h alert counts.",
      inputSchema: { engine: engine.optional() },
    },
    async ({ engine: e }) => json(await adapter.listInterfaces(e)),
  );

  server.registerTool(
    "ids_stats",
    {
      title: "Alert statistics",
      description: "Aggregate alert counts by engine and severity, plus top signatures and top talkers.",
      inputSchema: {
        engine: engine.optional(),
        sinceMinutes: z.number().int().positive().optional(),
      },
    },
    async (args) => json(await adapter.stats(args)),
  );

  server.registerTool(
    "net_list_hosts",
    {
      title: "Enumerate LAN hosts",
      description:
        "Enumerate machines on the local network (the 'radar'): IP, MAC, vendor, hostname, and state. Uses the box's ARP/neighbor table, plus the firewall's ARP + DHCP leases when a live pfSense is configured. Use this to answer 'what's on my network' or flag unknown/new devices.",
      inputSchema: {},
    },
    async () => json(await discoverHosts()),
  );

  // --- writes: dry-run unless confirm:true, and adapter still gates on env ---
  server.registerTool(
    "ids_toggle_rule",
    {
      title: "Enable/disable a rule",
      description:
        "Enable or disable a Suricata/Snort rule by gid/sid. Returns a dry-run preview unless confirm=true. The server also requires PICKET_ALLOW_WRITES=1 to actually mutate.",
      inputSchema: {
        engine,
        gid: z.number().int(),
        sid: z.number().int(),
        enabled: z.boolean(),
        confirm: z.boolean().optional(),
      },
    },
    async ({ confirm, ...args }) => {
      if (!confirm) {
        return json({
          dryRun: true,
          action: "toggleRule",
          args,
          note: "No change made. Re-call with confirm:true to apply.",
        });
      }
      return json({ applied: true, rule: await adapter.toggleRule(args) });
    },
  );

  server.registerTool(
    "ids_suppress_alert",
    {
      title: "Suppress a noisy signature",
      description:
        "Add a suppression for a gid/sid (optionally scoped to a source/dest IP) to cut alert noise without disabling the rule globally. Dry-run unless confirm=true; also needs PICKET_ALLOW_WRITES=1.",
      inputSchema: {
        engine,
        gid: z.number().int(),
        sid: z.number().int(),
        track: z.enum(["by_src", "by_dst", "by_either"]).optional(),
        ip: z.string().optional(),
        confirm: z.boolean().optional(),
      },
    },
    async ({ confirm, ...args }) => {
      if (!confirm) {
        return json({
          dryRun: true,
          action: "suppressAlert",
          args,
          note: "No change made. Re-call with confirm:true to apply.",
        });
      }
      return json({ applied: true, suppression: await adapter.suppressAlert(args) });
    },
  );
}
