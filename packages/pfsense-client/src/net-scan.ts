import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Host } from "./types.js";

const exec = promisify(execFile);

// Small, deliberately-partial OUI map (first 6 hex of the MAC). Unknown is fine.
const OUI: Record<string, string> = {
  B827EB: "Raspberry Pi",
  DCA632: "Raspberry Pi",
  E45F01: "Raspberry Pi",
  D83ADD: "Raspberry Pi",
  "246F28": "Espressif (IoT)",
  "240AC4": "Espressif (IoT)",
  A4CF12: "Espressif (IoT)",
  "8CAAB5": "Espressif (IoT)",
  "24A43C": "Ubiquiti",
  FCECDA: "Ubiquiti",
  "687251": "Ubiquiti",
  "50C7BF": "TP-Link",
  "1C61B4": "TP-Link",
  "001D7E": "Cisco-Linksys",
  F018A8: "Apple",
  "3C0754": "Apple",
  AC87A3: "Apple",
  F0DBF8: "Apple",
  "001132": "Synology",
  "0011D8": "ASUS",
  "001599": "Samsung",
  "5C0A5B": "Samsung",
  D052A8: "Google",
  "001788": "Philips Hue",
  B8278A: "Sonos",
  "94CC8D": "Sonos",
  "0090A9": "Western Digital",
  "001C42": "Parallels/VM",
  "080027": "VirtualBox",
  "005056": "VMware",
  "00155D": "Microsoft (Hyper-V/WSL)",
};

export function vendorOf(mac?: string): string | undefined {
  if (!mac) return undefined;
  return OUI[mac.toUpperCase().replace(/[:-]/g, "").slice(0, 6)];
}

async function run(cmd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await exec(cmd, args, { timeout: 8000, maxBuffer: 8 * 1024 * 1024 });
    return stdout;
  } catch {
    return "";
  }
}

/** Hosts the box itself can see (ARP/neighbor table). */
export async function localNeighbors(): Promise<Host[]> {
  const out = await run("ip", ["neigh", "show"]);
  const hosts: Host[] = [];
  const now = new Date().toISOString();
  for (const line of out.split("\n")) {
    const m = line.match(/^(\S+)\s+dev\s+(\S+)\s+lladdr\s+(\S+)\s+(\S+)/);
    if (!m) continue;
    const [, ip, iface, mac, st] = m;
    if (ip.includes(":")) continue; // radar is IPv4-only
    const state = st === "REACHABLE" ? "online" : st === "FAILED" ? "offline" : "stale";
    hosts.push({
      ip,
      mac: mac.toLowerCase(),
      iface,
      state,
      lastSeen: now,
      source: "neighbor",
      vendor: vendorOf(mac),
    });
  }
  // best-effort reverse DNS, bounded
  await Promise.all(
    hosts.slice(0, 64).map(async (h) => {
      const r = await run("getent", ["hosts", h.ip]);
      const name = r.split(/\s+/)[1];
      if (name && name !== h.ip) h.hostname = name;
    }),
  );
  return hosts;
}

/** The firewall's view of the whole LAN (ARP + DHCP leases) over SSH. */
async function firewallHosts(target: string, identity?: string): Promise<Host[]> {
  const args = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=8"];
  if (identity) args.push("-i", identity);
  args.push(
    target,
    "arp -an 2>/dev/null; echo '===LEASES==='; cat /var/dhcpd/var/db/dhcpd.leases 2>/dev/null",
  );
  const out = await run("ssh", args);
  const [arpPart = "", leasePart = ""] = out.split("===LEASES===");
  const now = new Date().toISOString();
  const byMac = new Map<string, Host>();

  // arp: ? (192.168.1.5) at aa:bb:cc:dd:ee:ff on em0 ...
  for (const line of arpPart.split("\n")) {
    const m = line.match(/\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-fA-F:]{17})\s+on\s+(\S+)/);
    if (!m) continue;
    const [, ip, mac, iface] = m;
    byMac.set(mac.toLowerCase(), {
      ip,
      mac: mac.toLowerCase(),
      iface,
      state: "online",
      lastSeen: now,
      source: "arp",
      vendor: vendorOf(mac),
    });
  }
  // dhcp leases give hostnames
  const leaseRe = /lease\s+(\d+\.\d+\.\d+\.\d+)\s*\{([^}]*)\}/g;
  let lm: RegExpExecArray | null;
  while ((lm = leaseRe.exec(leasePart))) {
    const ip = lm[1];
    const body = lm[2];
    const mac = body.match(/hardware ethernet\s+([0-9a-fA-F:]{17})/)?.[1]?.toLowerCase();
    const hostname = body.match(/client-hostname\s+"([^"]+)"/)?.[1];
    if (!mac) continue;
    const h = byMac.get(mac) ?? {
      ip,
      mac,
      state: "stale" as const,
      lastSeen: now,
      source: "dhcp" as const,
      vendor: vendorOf(mac),
    };
    if (hostname) h.hostname = hostname;
    byMac.set(mac, h);
  }
  return [...byMac.values()];
}

/** Best available LAN inventory: the box's neighbors + (when live) the firewall. */
export async function discoverHosts(): Promise<Host[]> {
  const all: Host[] = [...(await localNeighbors())];
  const fw = process.env.PICKET_PFSENSE_SSH;
  if (fw && (process.env.PICKET_BACKEND ?? "").startsWith("pfsense")) {
    all.push(...(await firewallHosts(fw, process.env.PICKET_PFSENSE_SSH_KEY)));
  }
  const merged = new Map<string, Host>();
  for (const h of all) {
    const k = h.mac || h.ip;
    const prev = merged.get(k);
    merged.set(
      k,
      prev
        ? { ...prev, ...h, hostname: h.hostname ?? prev.hostname, vendor: h.vendor ?? prev.vendor }
        : h,
    );
  }
  return [...merged.values()].sort((a, b) =>
    a.ip.localeCompare(b.ip, undefined, { numeric: true }),
  );
}
