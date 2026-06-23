// Browser-safe mirror of the MCP IDS tools, operating on the bundled demo
// fixtures (the @picket/client DemoAdapter does the same server-side).
import demo from '@picket/client/fixtures/demo.json';

export function listAlerts(q = {}) {
  let rows = demo.alerts.slice();
  if (q.engine) rows = rows.filter((a) => a.engine === q.engine);
  if (q.iface) rows = rows.filter((a) => a.iface === q.iface);
  if (q.severity) rows = rows.filter((a) => a.severity === q.severity);
  if (q.q) {
    const n = q.q.toLowerCase();
    rows = rows.filter((a) =>
      [a.signature, a.category, a.src_ip, a.dest_ip, String(a.sid)]
        .join(' ')
        .toLowerCase()
        .includes(n),
    );
  }
  rows.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  return q.limit ? rows.slice(0, q.limit) : rows;
}

export function listRules(q = {}) {
  let rows = demo.rules.slice();
  if (q.engine) rows = rows.filter((r) => r.engine === q.engine);
  if (q.enabled != null) rows = rows.filter((r) => r.enabled === q.enabled);
  if (q.q) {
    const n = q.q.toLowerCase();
    rows = rows.filter((r) => [r.msg, r.category, String(r.sid)].join(' ').toLowerCase().includes(n));
  }
  return rows;
}

export function listInterfaces() {
  return demo.interfaces.slice();
}

export function stats(q = {}) {
  const alerts = listAlerts(q);
  const byEngine = { suricata: 0, snort: 0 };
  const bySeverity = {};
  const sig = new Map();
  const talkers = new Map();
  for (const a of alerts) {
    byEngine[a.engine]++;
    bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
    const s = sig.get(a.sid) ?? { sid: a.sid, signature: a.signature, count: 0 };
    s.count++;
    sig.set(a.sid, s);
    talkers.set(a.src_ip, (talkers.get(a.src_ip) ?? 0) + 1);
  }
  return {
    total: alerts.length,
    byEngine,
    bySeverity,
    topSignatures: [...sig.values()].sort((a, b) => b.count - a.count).slice(0, 6),
    topTalkers: [...talkers.entries()]
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
  };
}
