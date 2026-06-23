export * from "./types.js";
export { type IdsAdapter, WritesDisabledError, writesEnabled } from "./adapter.js";
export { DemoAdapter } from "./demo-adapter.js";
export { PfSenseRestAdapter, type RestConfig } from "./rest-adapter.js";

import type { IdsAdapter } from "./adapter.js";
import { DemoAdapter } from "./demo-adapter.js";
import { PfSenseRestAdapter } from "./rest-adapter.js";

/**
 * Pick a backend from the environment:
 *   PICKET_BACKEND=pfsense + PICKET_PFSENSE_URL + PICKET_PFSENSE_KEY  -> live box
 *   otherwise                                                         -> demo fixtures
 */
export function createAdapter(): IdsAdapter {
  const backend = process.env.PICKET_BACKEND ?? "demo";
  if (backend === "pfsense") {
    return new PfSenseRestAdapter({
      baseUrl: process.env.PICKET_PFSENSE_URL ?? "",
      apiKey: process.env.PICKET_PFSENSE_KEY ?? "",
    });
  }
  return new DemoAdapter(process.env.PICKET_FIXTURE);
}
