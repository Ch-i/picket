/** Core domain model for pfSense IDS/IPS (Suricata + Snort). */

export type Engine = "suricata" | "snort";

/** 1 = high/critical, 2 = medium, 3 = low (mirrors Suricata/Snort priority). */
export type Severity = 1 | 2 | 3;

export type Action = "alert" | "drop";

export interface Alert {
  id: string;
  ts: string; // ISO-8601
  engine: Engine;
  iface: string; // "wan" | "lan" | ...
  action: Action;
  gid: number;
  sid: number;
  rev: number;
  signature: string;
  category: string;
  severity: Severity;
  proto: string;
  src_ip: string;
  src_port?: number;
  dest_ip: string;
  dest_port?: number;
  ruleset: string; // "ET OPEN", "Snort GPL", "Snort VRT", ...
}

export interface Rule {
  engine: Engine;
  gid: number;
  sid: number;
  rev: number;
  enabled: boolean;
  action: Action;
  msg: string;
  category: string;
  ruleset: string;
  references?: string[];
}

export interface Interface {
  name: string;
  descr: string;
  engine: Engine;
  enabled: boolean;
  blockOffenders: boolean;
  alerts24h: number;
}

export type SuppressTrack = "by_src" | "by_dst" | "by_either";

export interface Suppression {
  engine: Engine;
  gid: number;
  sid: number;
  track: SuppressTrack;
  ip?: string;
  created: string;
}

export interface Stats {
  total: number;
  byEngine: Record<Engine, number>;
  bySeverity: Record<string, number>;
  topSignatures: { sid: number; signature: string; count: number }[];
  topTalkers: { ip: string; count: number }[];
}

export interface AlertQuery {
  engine?: Engine;
  iface?: string;
  severity?: Severity;
  sinceMinutes?: number;
  q?: string; // free-text over signature/category/ip
  limit?: number;
}

export interface RuleQuery {
  engine?: Engine;
  enabled?: boolean;
  category?: string;
  q?: string;
  limit?: number;
}
