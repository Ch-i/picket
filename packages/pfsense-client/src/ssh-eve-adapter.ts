import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type IdsAdapter } from "./adapter.js";
import type {
  Alert,
  AlertQuery,
  Engine,
  Interface,
  Rule,
  RuleQuery,
  Severity,
  Stats,
  Suppression,
} from "./types.js";

const exec = promisify(execFile);

export interface SshConfig {
  target: string; // user@host
  identity?: string; // private key path
  port?: number;
  /** Glob of Suricata EVE logs on the box. */
  eveGlob?: string;
  tailLines?: number;
}

/**
 * Read-only live backend for a pfSense box running Suricata, reached over SSH.
 * Tails the Suricata EVE JSON logs and maps `alert` events to the Picket model.
 * Writes are not supported here — installing the pfSense REST API package (use
 * PfSenseRestAdapter) is the path for rule toggles / suppressions.
 */
export class SshEveAdapter implements IdsAdapter {
  readonly mode = "pfsense" as const;
  private cfg: Required<Pick<SshConfig, "target">> & SshConfig;

  constructor(cfg: SshConfig) {
    if (!cfg.target) {
      throw new Error("SshEveAdapter needs a target (PICKET_PFSENSE_SSH=user@host).");
    }
    this.cfg = {
      eveGlob: "/var/log/suricata/*/eve.json",
      tailLines: 3000,
      ...cfg,
    };
  }

  private async ssh(remoteCmd: string): Promise<string> {
    const args = [
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "ConnectTimeout=8",
    ];
    if (this.cfg.port) args.push("-p", String(this.cfg.port));
    if (this.cfg.identity) args.push("-i", this.cfg.identity);
    args.push(this.cfg.target, remoteCmd);
    const { stdout } = await exec("ssh", args, { maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  }

  private async readAlerts(): Promise<Alert[]> {
    const cmd = `for f in ${this.cfg.eveGlob}; do tail -n ${this.cfg.tailLines} "$f"; done 2>/dev/null`;
    const out = await this.ssh(cmd);
    const rows: Alert[] = [];
    for (const line of out.split("\n")) {
      const s = line.trim();
      if (!s.startsWith("{")) continue;
      let e: any;
      try {
        e = JSON.parse(s);
      } catch {
        continue;
      }
      if (e.event_type !== "alert" || !e.alert) continue;
      rows.push(mapEve(e));
    }
    rows.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
    return rows;
  }

  async listAlerts(q: AlertQuery = {}): Promise<Alert[]> {
    let rows = await this.readAlerts();
    if (q.iface) rows = rows.filter((a) => a.iface === q.iface);
    if (q.severity) rows = rows.filter((a) => a.severity === q.severity);
    if (q.sinceMinutes != null) {
      const cutoff = Date.now() - q.sinceMinutes * 60_000;
      rows = rows.filter((a) => Date.parse(a.ts) >= cutoff);
    }
    if (q.q) {
      const n = q.q.toLowerCase();
      rows = rows.filter((a) =>
        [a.signature, a.category, a.src_ip, a.dest_ip, String(a.sid)]
          .join(" ")
          .toLowerCase()
          .includes(n),
      );
    }
    return q.limit ? rows.slice(0, q.limit) : rows;
  }

  async getAlert(id: string): Promise<Alert | null> {
    return (await this.readAlerts()).find((a) => a.id === id) ?? null;
  }

  /** Derived from observed alerts (the EVE feed doesn't carry the full ruleset). */
  async listRules(q: RuleQuery = {}): Promise<Rule[]> {
    const seen = new Map<number, Rule>();
    for (const a of await this.readAlerts()) {
      if (!seen.has(a.sid)) {
        seen.set(a.sid, {
          engine: "suricata",
          gid: a.gid,
          sid: a.sid,
          rev: a.rev,
          enabled: true,
          action: a.action,
          msg: a.signature,
          category: a.category,
          ruleset: a.ruleset,
        });
      }
    }
    let rows = [...seen.values()];
    if (q.category) rows = rows.filter((r) => r.category === q.category);
    if (q.q) {
      const n = q.q.toLowerCase();
      rows = rows.filter((r) => [r.msg, String(r.sid)].join(" ").toLowerCase().includes(n));
    }
    return q.limit ? rows.slice(0, q.limit) : rows;
  }

  async listInterfaces(): Promise<Interface[]> {
    const counts = new Map<string, number>();
    for (const a of await this.readAlerts()) counts.set(a.iface, (counts.get(a.iface) ?? 0) + 1);
    return [...counts.entries()].map(([name, alerts24h]) => ({
      name,
      descr: name,
      engine: "suricata" as Engine,
      enabled: true,
      blockOffenders: false,
      alerts24h,
    }));
  }

  async stats(q: { engine?: Engine; sinceMinutes?: number } = {}): Promise<Stats> {
    const alerts = await this.listAlerts(q);
    const byEngine: Record<Engine, number> = { suricata: 0, snort: 0 };
    const bySeverity: Record<string, number> = {};
    const sig = new Map<number, { signature: string; count: number }>();
    const talkers = new Map<string, number>();
    for (const a of alerts) {
      byEngine[a.engine]++;
      bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
      const s = sig.get(a.sid) ?? { signature: a.signature, count: 0 };
      s.count++;
      sig.set(a.sid, s);
      talkers.set(a.src_ip, (talkers.get(a.src_ip) ?? 0) + 1);
    }
    return {
      total: alerts.length,
      byEngine,
      bySeverity,
      topSignatures: [...sig.entries()]
        .map(([sid, v]) => ({ sid, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topTalkers: [...talkers.entries()]
        .map(([ip, count]) => ({ ip, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  async toggleRule(): Promise<Rule> {
    throw new Error(
      "Rule toggles are not supported over the SSH/EVE backend (read-only). Install the pfSense REST API package and use PICKET_BACKEND=pfsense.",
    );
  }

  async suppressAlert(): Promise<Suppression> {
    throw new Error(
      "Suppressions are not supported over the SSH/EVE backend (read-only). Install the pfSense REST API package and use PICKET_BACKEND=pfsense.",
    );
  }
}

function mapEve(e: any): Alert {
  const sev = Number(e.alert.severity ?? 3);
  return {
    id: String(e.flow_id ?? `${e.alert.signature_id}-${e.timestamp}`),
    ts: e.timestamp ?? new Date().toISOString(),
    engine: "suricata",
    iface: e.in_iface ?? "wan",
    action: e.alert.action === "blocked" ? "drop" : "alert",
    gid: Number(e.alert.gid ?? 1),
    sid: Number(e.alert.signature_id),
    rev: Number(e.alert.rev ?? 1),
    signature: e.alert.signature ?? "",
    category: e.alert.category ?? "uncategorized",
    severity: ((sev >= 1 && sev <= 3 ? sev : 3) as Severity),
    proto: e.proto ?? "TCP",
    src_ip: e.src_ip ?? "",
    src_port: e.src_port,
    dest_ip: e.dest_ip ?? "",
    dest_port: e.dest_port,
    ruleset: "suricata",
  };
}
