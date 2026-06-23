// Scripted "agent" for the static demo: it runs the *real* browser tools over
// the fixtures and narrates the result. Swap this for a live Claude tool-use
// loop (same tool surface, via the MCP server) when an API key + backend exist.
import { listAlerts, listRules, stats } from './ids-tools';

export const SUGGESTIONS = [
  'Why am I flooded with alerts on WAN?',
  'Anything critical right now?',
  'Who are the top talkers?',
  'Disable the curl policy rule',
];

const tool = (name, args, result) => ({ kind: 'tool', tool: name, args, result });
const say = (text) => ({ kind: 'say', text });
const propose = (summary, t, args, danger = false) => ({ kind: 'propose', summary, tool: t, args, danger });

export function runAgent(message) {
  const m = message.toLowerCase();

  // 1) WAN noise / triage / scan flood
  if (/\b(wan|flood|noise|noisy|scan|triage|why)\b/.test(m)) {
    const s = stats({ iface: 'wan' });
    const top = s.topSignatures[0];
    const hits = listAlerts({ iface: 'wan', q: String(top.sid) });
    const src = hits[0]?.src_ip;
    return [
      tool('ids_stats', { iface: 'wan' }, { total: s.total, topSignatures: s.topSignatures.slice(0, 3), topTalkers: s.topTalkers.slice(0, 3) }),
      say(`WAN is carrying **${s.total} alerts**. The dominant signature is **sid:${top.sid} — ${top.signature}**, firing **${top.count}×**.`),
      tool('ids_list_alerts', { iface: 'wan', q: `${top.sid}` }, hits.map((h) => ({ ts: h.ts, src: h.src_ip, dst: `${h.dest_ip}:${h.dest_port}`, sev: h.severity }))),
      say(`All ${hits.length} are from a single source, **${src}**, hammering port ${hits[0]?.dest_port}. That's a one-host recon sweep, not a distributed threat — safe to quiet at the source without disabling the rule globally.`),
      propose(`Suppress sid:${top.sid} from ${src} (by_src) — silences the sweep, keeps the rule active for every other host.`, 'ids_suppress_alert', { engine: 'suricata', gid: top.gid ?? 1, sid: top.sid, track: 'by_src', ip: src }),
    ];
  }

  // 2) critical / urgent
  if (/\b(critical|urgent|severe|serious|important|priority|worst|now)\b/.test(m)) {
    const crit = listAlerts({ severity: 1 });
    return [
      tool('ids_list_alerts', { severity: 1 }, crit.map((a) => ({ engine: a.engine, iface: a.iface, action: a.action, sig: a.signature, src: a.src_ip, dst: a.dest_ip }))),
      say(`**${crit.length} high-severity** events. The one to act on: **${crit.find((a) => /cobalt/i.test(a.signature))?.signature || crit[0].signature}** — host **${crit.find((a) => /cobalt/i.test(a.signature))?.src_ip || crit[0].src_ip}** is beaconing outbound to a known C2 endpoint, and it *was dropped*. That internal host is likely compromised; the SQLi and PHP-CGI RCE attempts on the DMZ are external probes, lower priority.`),
      say(`Recommend: isolate the beaconing host and pull its process list — the IDS already blocked the channel, but the implant is resident.`),
    ];
  }

  // 3) top talkers
  if (/\b(talker|talkers|who|source|sources|hitting|most|busiest|attacker)\b/.test(m)) {
    const s = stats();
    return [
      tool('ids_stats', {}, { topTalkers: s.topTalkers, topSignatures: s.topSignatures.slice(0, 3) }),
      say(`Top talker is **${s.topTalkers[0].ip}** (${s.topTalkers[0].count} alerts) — the WAN scanner. Internally, **${(s.topTalkers.find((t) => t.ip.startsWith('10.')) || {}).ip || 'no internal host'}** stands out, which lines up with the Cobalt Strike beacon. Everything else is single-shot external probing.`),
    ];
  }

  // 4) disable a rule
  if (/\b(disable|turn off|mute|stop|silence)\b/.test(m)) {
    const target = listRules({ q: /curl|policy/.test(m) ? 'curl' : m.replace(/disable|turn off|the|rule/g, '').trim() })[0] || listRules({ q: 'curl' })[0];
    if (target) {
      return [
        tool('ids_list_rules', { q: 'curl' }, [{ sid: target.sid, msg: target.msg, enabled: target.enabled, category: target.category }]),
        say(`Found **sid:${target.sid} — ${target.msg}** (${target.category}), currently *${target.enabled ? 'enabled' : 'disabled'}*. It's policy-class, not a threat signature, so disabling it only drops the noise.`),
        propose(`Disable sid:${target.sid} — ${target.msg}.`, 'ids_toggle_rule', { engine: target.engine, gid: target.gid ?? 1, sid: target.sid, enabled: false }, true),
      ];
    }
  }

  // fallback: keyword search
  const hits = listAlerts({ q: message.replace(/[^a-z0-9 .:]/gi, '').trim(), limit: 6 });
  if (hits.length) {
    return [
      tool('ids_list_alerts', { q: message.trim() }, hits.map((h) => ({ engine: h.engine, sig: h.signature, src: h.src_ip, sev: h.severity }))),
      say(`Found **${hits.length}** matching event(s). Top match: **${hits[0].signature}** (${hits[0].engine}, sev${hits[0].severity}) from ${hits[0].src_ip}. Ask me to triage WAN, surface critical events, or suppress a noisy signature.`),
    ];
  }
  return [
    say(`No events matched that. Try: *"why am I flooded on WAN?"*, *"anything critical?"*, or *"who are the top talkers?"* — I'll query the live alert feed and propose actions.`),
  ];
}
