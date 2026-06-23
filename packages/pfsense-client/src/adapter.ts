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

/**
 * One interface, two backends: an in-memory DemoAdapter (fixtures, for a
 * self-contained demo) and a PfSenseRestAdapter (live box). The MCP server and
 * the Ember app depend only on this interface, never on a concrete backend.
 */
export interface IdsAdapter {
  readonly mode: "demo" | "pfsense";

  // reads
  listAlerts(q?: AlertQuery): Promise<Alert[]>;
  getAlert(id: string): Promise<Alert | null>;
  listRules(q?: RuleQuery): Promise<Rule[]>;
  listInterfaces(engine?: Engine): Promise<Interface[]>;
  stats(q?: { engine?: Engine; sinceMinutes?: number }): Promise<Stats>;

  // writes (guarded — see PICKET_ALLOW_WRITES)
  toggleRule(args: {
    engine: Engine;
    gid: number;
    sid: number;
    enabled: boolean;
  }): Promise<Rule>;
  suppressAlert(args: {
    engine: Engine;
    gid: number;
    sid: number;
    track?: SuppressTrack;
    ip?: string;
  }): Promise<Suppression>;
}

/** Thrown by write paths when writes are not explicitly enabled. */
export class WritesDisabledError extends Error {
  constructor(op: string) {
    super(
      `Refusing to ${op}: writes are disabled. Set PICKET_ALLOW_WRITES=1 to permit mutations.`,
    );
    this.name = "WritesDisabledError";
  }
}

export function writesEnabled(): boolean {
  return process.env.PICKET_ALLOW_WRITES === "1";
}
