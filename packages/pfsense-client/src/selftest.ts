/** Quick proof the data layer works without an MCP client or a browser. */
import { createAdapter } from "./index.js";

const adapter = createAdapter();

const alerts = await adapter.listAlerts({ limit: 5 });
const rules = await adapter.listRules();
const ifaces = await adapter.listInterfaces();
const stats = await adapter.stats();

console.log(`backend: ${adapter.mode}`);
console.log(`alerts: ${(await adapter.listAlerts()).length}  rules: ${rules.length}  interfaces: ${ifaces.length}`);
console.log(`\ntop signatures:`);
for (const s of stats.topSignatures.slice(0, 5)) {
  console.log(`  sid:${s.sid}  x${s.count}  ${s.signature}`);
}
console.log(`\nlatest alerts:`);
for (const a of alerts) {
  console.log(
    `  [${a.engine}/${a.iface}] sev${a.severity} ${a.src_ip} -> ${a.dest_ip}  ${a.signature}`,
  );
}
