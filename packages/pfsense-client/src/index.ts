export * from "./types.js";
export { type IdsAdapter, WritesDisabledError, writesEnabled } from "./adapter.js";
export { DemoAdapter } from "./demo-adapter.js";
export { PfSenseRestAdapter, type RestConfig } from "./rest-adapter.js";
export { SshEveAdapter, type SshConfig } from "./ssh-eve-adapter.js";

import type { IdsAdapter } from "./adapter.js";
import { DemoAdapter } from "./demo-adapter.js";
import { PfSenseRestAdapter } from "./rest-adapter.js";
import { SshEveAdapter } from "./ssh-eve-adapter.js";

/**
 * Pick a backend from the environment:
 *   PICKET_BACKEND=pfsense     + PICKET_PFSENSE_URL/KEY   -> live box, REST API package (read+write)
 *   PICKET_BACKEND=pfsense-ssh + PICKET_PFSENSE_SSH       -> live box over SSH, Suricata EVE feed (read-only)
 *   otherwise                                             -> demo fixtures
 */
export function createAdapter(): IdsAdapter {
  const backend = process.env.PICKET_BACKEND ?? "demo";
  if (backend === "pfsense") {
    return new PfSenseRestAdapter({
      baseUrl: process.env.PICKET_PFSENSE_URL ?? "",
      apiKey: process.env.PICKET_PFSENSE_KEY ?? "",
    });
  }
  if (backend === "pfsense-ssh") {
    return new SshEveAdapter({
      target: process.env.PICKET_PFSENSE_SSH ?? "",
      identity: process.env.PICKET_PFSENSE_SSH_KEY,
      port: process.env.PICKET_PFSENSE_SSH_PORT ? Number(process.env.PICKET_PFSENSE_SSH_PORT) : undefined,
      eveGlob: process.env.PICKET_EVE_GLOB,
    });
  }
  return new DemoAdapter(process.env.PICKET_FIXTURE);
}
