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

export interface RestConfig {
  baseUrl: string; // e.g. https://pfsense.lan
  apiKey: string; // pfSense REST API package token
  /** Override endpoint paths if your pfSense API package differs. */
  paths?: Partial<Record<"alerts" | "rules" | "interfaces" | "toggle" | "suppress", string>>;
  insecureTLS?: boolean;
}

/**
 * Live backend for a real pfSense box running the Suricata/Snort packages plus
 * the community pfSense REST API. The endpoint paths are configurable because
 * Suricata/Snort are not first-class in pfSense core — most deployments expose
 * them through a thin custom endpoint or a log-tailing shim.
 *
 * This adapter is wired (real fetch + auth) but the exact response shapes must
 * be validated against your box — see the `map*` helpers. Until configured it
 * fails loudly rather than pretending, so `demo` stays the default path.
 */
export class PfSenseRestAdapter implements IdsAdapter {
  readonly mode = "pfsense" as const;
  private cfg: RestConfig;

  constructor(cfg: RestConfig) {
    if (!cfg.baseUrl || !cfg.apiKey) {
      throw new Error(
        "PfSenseRestAdapter needs baseUrl + apiKey (PICKET_PFSENSE_URL / PICKET_PFSENSE_KEY).",
      );
    }
    this.cfg = cfg;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(new URL(path, this.cfg.baseUrl), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`pfSense ${path} -> ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  private p(key: keyof NonNullable<RestConfig["paths"]>, fallback: string): string {
    return this.cfg.paths?.[key] ?? fallback;
  }

  async listAlerts(q: AlertQuery = {}): Promise<Alert[]> {
    const qs = new URLSearchParams();
    if (q.engine) qs.set("engine", q.engine);
    if (q.iface) qs.set("interface", q.iface);
    if (q.limit) qs.set("limit", String(q.limit));
    const raw = await this.req<{ data: unknown[] }>(
      `${this.p("alerts", "/api/v2/services/ids/alerts")}?${qs}`,
    );
    return raw.data.map(mapAlert);
  }

  async getAlert(id: string): Promise<Alert | null> {
    const all = await this.listAlerts({ limit: 500 });
    return all.find((a) => a.id === id) ?? null;
  }

  async listRules(q: RuleQuery = {}): Promise<Rule[]> {
    const qs = new URLSearchParams();
    if (q.engine) qs.set("engine", q.engine);
    if (q.category) qs.set("category", q.category);
    const raw = await this.req<{ data: unknown[] }>(
      `${this.p("rules", "/api/v2/services/ids/rules")}?${qs}`,
    );
    let rows = raw.data.map(mapRule);
    if (q.enabled != null) rows = rows.filter((r) => r.enabled === q.enabled);
    return q.limit ? rows.slice(0, q.limit) : rows;
  }

  async listInterfaces(engine?: Engine): Promise<Interface[]> {
    const raw = await this.req<{ data: unknown[] }>(
      this.p("interfaces", "/api/v2/services/ids/interfaces"),
    );
    return raw.data.map(mapInterface).filter((i) => !engine || i.engine === engine);
  }

  async stats(q: { engine?: Engine; sinceMinutes?: number } = {}): Promise<Stats> {
    // Derived client-side from the alert feed so it works on any pfSense build.
    const alerts = await this.listAlerts({ engine: q.engine, limit: 1000 });
    const byEngine: Record<Engine, number> = { suricata: 0, snort: 0 };
    const bySeverity: Record<string, number> = {};
    for (const a of alerts) {
      byEngine[a.engine]++;
      bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
    }
    return { total: alerts.length, byEngine, bySeverity, topSignatures: [], topTalkers: [] };
  }

  async toggleRule(args: {
    engine: Engine;
    gid: number;
    sid: number;
    enabled: boolean;
  }): Promise<Rule> {
    if (!writesEnabled()) throw new WritesDisabledError("toggle a rule");
    const raw = await this.req<{ data: unknown }>(
      this.p("toggle", "/api/v2/services/ids/rule/toggle"),
      { method: "POST", body: JSON.stringify(args) },
    );
    return mapRule(raw.data);
  }

  async suppressAlert(args: {
    engine: Engine;
    gid: number;
    sid: number;
    track?: SuppressTrack;
    ip?: string;
  }): Promise<Suppression> {
    if (!writesEnabled()) throw new WritesDisabledError("add a suppression");
    await this.req(this.p("suppress", "/api/v2/services/ids/suppress"), {
      method: "POST",
      body: JSON.stringify(args),
    });
    return {
      engine: args.engine,
      gid: args.gid,
      sid: args.sid,
      track: args.track ?? "by_src",
      ip: args.ip,
      created: new Date().toISOString(),
    };
  }
}

// --- response mappers (validate against your pfSense build) ----------------
function mapAlert(r: any): Alert {
  return {
    id: String(r.id ?? `${r.sid}-${r.timestamp}`),
    ts: r.timestamp ?? r.ts ?? new Date().toISOString(),
    engine: (r.engine ?? "suricata") as Engine,
    iface: r.interface ?? r.iface ?? "wan",
    action: r.action === "drop" ? "drop" : "alert",
    gid: Number(r.gid ?? 1),
    sid: Number(r.sid),
    rev: Number(r.rev ?? 1),
    signature: r.signature ?? r.msg ?? "",
    category: r.category ?? r.classification ?? "uncategorized",
    severity: (Number(r.priority ?? r.severity ?? 3) as Alert["severity"]) || 3,
    proto: r.proto ?? "TCP",
    src_ip: r.src_ip ?? r.source ?? "",
    src_port: r.src_port,
    dest_ip: r.dest_ip ?? r.destination ?? "",
    dest_port: r.dest_port,
    ruleset: r.ruleset ?? "unknown",
  };
}

function mapRule(r: any): Rule {
  return {
    engine: (r.engine ?? "suricata") as Engine,
    gid: Number(r.gid ?? 1),
    sid: Number(r.sid),
    rev: Number(r.rev ?? 1),
    enabled: r.enabled === true || r.enabled === "yes" || r.state === "enabled",
    action: r.action === "drop" ? "drop" : "alert",
    msg: r.msg ?? r.signature ?? "",
    category: r.category ?? "uncategorized",
    ruleset: r.ruleset ?? "unknown",
    references: r.references,
  };
}

function mapInterface(r: any): Interface {
  return {
    name: r.name ?? r.if ?? "wan",
    descr: r.descr ?? r.name ?? "",
    engine: (r.engine ?? "suricata") as Engine,
    enabled: r.enabled !== false,
    blockOffenders: r.blockoffenders === true || r.block_offenders === true,
    alerts24h: Number(r.alerts24h ?? 0),
  };
}
