import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  type IdsAdapter,
  WritesDisabledError,
  writesEnabled,
} from "./adapter.js";
import type {
  Alert,
  AlertQuery,
  Engine,
  Interface,
  Rule,
  RuleQuery,
  Stats,
  Suppression,
  SuppressTrack,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Fixture {
  alerts: Alert[];
  rules: Rule[];
  interfaces: Interface[];
}

/**
 * Self-contained backend over JSON fixtures. Reads filter in-memory; writes
 * mutate the in-memory copy only (ephemeral) so the demo is safe to click
 * through. Honors PICKET_ALLOW_WRITES so the write path matches the live box.
 */
export class DemoAdapter implements IdsAdapter {
  readonly mode = "demo" as const;
  private data: Fixture;
  private suppressions: Suppression[] = [];

  constructor(fixturePath?: string) {
    const p = fixturePath ?? join(__dirname, "..", "fixtures", "demo.json");
    this.data = JSON.parse(readFileSync(p, "utf8")) as Fixture;
  }

  async listAlerts(q: AlertQuery = {}): Promise<Alert[]> {
    let rows = this.data.alerts.slice();
    if (q.engine) rows = rows.filter((a) => a.engine === q.engine);
    if (q.iface) rows = rows.filter((a) => a.iface === q.iface);
    if (q.severity) rows = rows.filter((a) => a.severity === q.severity);
    if (q.sinceMinutes != null) {
      const cutoff = Date.now() - q.sinceMinutes * 60_000;
      rows = rows.filter((a) => Date.parse(a.ts) >= cutoff);
    }
    if (q.q) {
      const needle = q.q.toLowerCase();
      rows = rows.filter((a) =>
        [a.signature, a.category, a.src_ip, a.dest_ip, String(a.sid)]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }
    rows.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
    return q.limit ? rows.slice(0, q.limit) : rows;
  }

  async getAlert(id: string): Promise<Alert | null> {
    return this.data.alerts.find((a) => a.id === id) ?? null;
  }

  async listRules(q: RuleQuery = {}): Promise<Rule[]> {
    let rows = this.data.rules.slice();
    if (q.engine) rows = rows.filter((r) => r.engine === q.engine);
    if (q.enabled != null) rows = rows.filter((r) => r.enabled === q.enabled);
    if (q.category) rows = rows.filter((r) => r.category === q.category);
    if (q.q) {
      const needle = q.q.toLowerCase();
      rows = rows.filter((r) =>
        [r.msg, r.category, String(r.sid)].join(" ").toLowerCase().includes(needle),
      );
    }
    return q.limit ? rows.slice(0, q.limit) : rows;
  }

  async listInterfaces(engine?: Engine): Promise<Interface[]> {
    return this.data.interfaces.filter((i) => !engine || i.engine === engine);
  }

  async stats(q: { engine?: Engine; sinceMinutes?: number } = {}): Promise<Stats> {
    const alerts = await this.listAlerts(q);
    const byEngine: Record<Engine, number> = { suricata: 0, snort: 0 };
    const bySeverity: Record<string, number> = {};
    const sigCount = new Map<number, { signature: string; count: number }>();
    const talkers = new Map<string, number>();
    for (const a of alerts) {
      byEngine[a.engine]++;
      bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
      const s = sigCount.get(a.sid) ?? { signature: a.signature, count: 0 };
      s.count++;
      sigCount.set(a.sid, s);
      talkers.set(a.src_ip, (talkers.get(a.src_ip) ?? 0) + 1);
    }
    return {
      total: alerts.length,
      byEngine,
      bySeverity,
      topSignatures: [...sigCount.entries()]
        .map(([sid, v]) => ({ sid, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topTalkers: [...talkers.entries()]
        .map(([ip, count]) => ({ ip, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  async toggleRule(args: {
    engine: Engine;
    gid: number;
    sid: number;
    enabled: boolean;
  }): Promise<Rule> {
    if (!writesEnabled()) throw new WritesDisabledError("toggle a rule");
    const rule = this.data.rules.find(
      (r) => r.engine === args.engine && r.gid === args.gid && r.sid === args.sid,
    );
    if (!rule) throw new Error(`No ${args.engine} rule gid:${args.gid} sid:${args.sid}`);
    rule.enabled = args.enabled;
    return rule;
  }

  async suppressAlert(args: {
    engine: Engine;
    gid: number;
    sid: number;
    track?: SuppressTrack;
    ip?: string;
  }): Promise<Suppression> {
    if (!writesEnabled()) throw new WritesDisabledError("add a suppression");
    const entry: Suppression = {
      engine: args.engine,
      gid: args.gid,
      sid: args.sid,
      track: args.track ?? "by_src",
      ip: args.ip,
      created: new Date().toISOString(),
    };
    this.suppressions.push(entry);
    return entry;
  }
}
