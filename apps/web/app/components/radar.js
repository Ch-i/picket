import { LitElement, html, css, svg } from 'lit';
import demo from '@picket/client/fixtures/demo.json';

// stable 32-bit hash → deterministic blip placement per device
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const KIND_COLOR = {
  firewall: 'var(--cl-signal-on, #6cd4f2)',
  router: 'var(--cl-signal-on, #6cd4f2)',
  nas: 'var(--cl-ok, #87a866)',
  server: 'var(--cl-ok, #87a866)',
  laptop: 'var(--cl-ink, #e8e2d6)',
  phone: 'var(--cl-ink, #e8e2d6)',
  tablet: 'var(--cl-ink, #e8e2d6)',
  printer: 'var(--cl-ink-dim, #a89f8a)',
  iot: 'var(--cl-water, #5d8fc0)',
  unknown: 'var(--cl-alert, #d4543c)',
};

const C = 150; // scope centre

/** Network "radar": enumerate + sweep the machines on the local LAN. */
export class PicketRadar extends LitElement {
  static properties = {
    hosts: { state: true },
    live: { state: true },
    selected: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      font-family: var(--cl-sans, sans-serif);
      color: var(--cl-ink, #e8e2d6);
    }
    .wrap {
      display: flex;
      gap: 18px;
      flex-wrap: wrap;
      align-items: flex-start;
    }
    .scope {
      position: relative;
      width: 300px;
      height: 300px;
      flex: none;
      border-radius: 50%;
      background: radial-gradient(circle at 50% 50%, rgba(52, 163, 196, 0.05), var(--cl-paper-deep, #04060a) 72%);
      border: 0.5px solid var(--cl-neatline, #2b3340);
    }
    .scope svg { position: absolute; inset: 0; }
    .ring { fill: none; stroke: var(--cl-neatline, #2b3340); stroke-width: 0.5; }
    .cross { stroke: var(--cl-neatline, #2b3340); stroke-width: 0.4; }
    .blip { cursor: pointer; transition: r 0.15s ease; }
    .blip:hover { r: 5; }
    .blip.sel { stroke: var(--cl-ink, #e8e2d6); stroke-width: 1; }
    .blip.stale { opacity: 0.55; }
    .blip.offline { opacity: 0.28; }
    .sweep {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      pointer-events: none;
      background: conic-gradient(
        from 0deg,
        rgba(52, 163, 196, 0) 0deg,
        rgba(52, 163, 196, 0) 305deg,
        rgba(52, 163, 196, 0.14) 345deg,
        rgba(108, 212, 242, 0.4) 360deg
      );
      animation: sweep 4s linear infinite;
    }
    @keyframes sweep { to { transform: rotate(360deg); } }

    .roster { flex: 1; min-width: 280px; }
    .roster-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 8px;
    }
    .roster-head .n { font: 600 13px var(--cl-mono, monospace); }
    .src {
      font: 500 9px/1 var(--cl-mono, monospace);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--cl-signal-on, #6cd4f2);
    }
    table { width: 100%; border-collapse: collapse; font: 400 12px var(--cl-mono, monospace); }
    th {
      text-align: left;
      font: 500 9px var(--cl-mono, monospace);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cl-ink-faint, #6a6357);
      padding: 4px 8px;
      border-bottom: 0.5px solid var(--cl-neatline, #2b3340);
    }
    td { padding: 5px 8px; border-bottom: 0.5px solid var(--cl-rule, #1a212b); white-space: nowrap; }
    tr { cursor: pointer; }
    tr:hover td { background: rgba(255, 255, 255, 0.025); }
    tr.sel td { background: rgba(52, 163, 196, 0.08); }
    .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
    .name { color: var(--cl-ink, #e8e2d6); }
    .muted { color: var(--cl-ink-faint, #6a6357); }
    .vendor { color: var(--cl-ink-dim, #a89f8a); }
  `;

  constructor() {
    super();
    this.hosts = demo.hosts ?? [];
    this.live = false;
    this.selected = null;
    this._timer = null;
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.#refresh();
    if (this.live) this._timer = setInterval(() => this.#refresh(), 15000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._timer) clearInterval(this._timer);
  }

  async #refresh() {
    try {
      const r = await fetch('/api/hosts', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      if (Array.isArray(d.hosts)) {
        this.hosts = d.hosts;
        this.live = true;
      }
    } catch {
      this.live = false; // static deploy → keep fixtures
    }
  }

  #pos(h) {
    const a = (hash(h.mac || h.ip) / 0xffffffff) * Math.PI * 2;
    const r =
      h.kind === 'firewall' || h.kind === 'router'
        ? 16
        : 46 + (hash((h.ip || '') + 'r') % 92);
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  }

  #dotColor(state) {
    return state === 'online'
      ? 'var(--cl-ok, #87a866)'
      : state === 'offline'
        ? 'var(--cl-ink-faint, #6a6357)'
        : 'var(--cl-signal-warn, #d27238)';
  }

  render() {
    const hosts = this.hosts ?? [];
    const online = hosts.filter((h) => h.state === 'online').length;
    return html`
      <div class="wrap">
        <div class="scope">
          <svg viewBox="0 0 300 300" aria-label="network radar">
            ${[40, 80, 120, 140].map((r) => svg`<circle class="ring" cx="150" cy="150" r="${r}"></circle>`)}
            <line class="cross" x1="10" y1="150" x2="290" y2="150"></line>
            <line class="cross" x1="150" y1="10" x2="150" y2="290"></line>
            ${hosts.map((h) => {
              const [x, y] = this.#pos(h);
              const key = h.mac || h.ip;
              return svg`<circle
                class="blip ${h.state} ${this.selected === key ? 'sel' : ''}"
                cx="${x}" cy="${y}" r="${h.kind === 'firewall' ? 4.5 : 3.5}"
                fill="${KIND_COLOR[h.kind] ?? 'var(--cl-ink-dim, #a89f8a)'}"
                @click=${() => (this.selected = key)}
              ><title>${h.hostname || h.ip} — ${h.vendor || h.kind || 'device'}</title></circle>`;
            })}
          </svg>
          <div class="sweep"></div>
        </div>

        <div class="roster">
          <div class="roster-head">
            <span class="n">${hosts.length} hosts · ${online} online</span>
            <span class="src">${this.live ? 'live scan' : 'demo'}</span>
          </div>
          <table>
            <thead>
              <tr><th>IP</th><th>Host</th><th>Vendor</th><th>MAC</th></tr>
            </thead>
            <tbody>
              ${hosts.map((h) => {
                const key = h.mac || h.ip;
                return html`<tr
                  class=${this.selected === key ? 'sel' : ''}
                  @click=${() => (this.selected = key)}
                >
                  <td><span class="dot" style="background:${this.#dotColor(h.state)}"></span>${h.ip}</td>
                  <td class=${h.hostname ? 'name' : 'muted'}>${h.hostname || '—'}</td>
                  <td class="vendor">${h.vendor || '—'}</td>
                  <td class="muted">${h.mac || '—'}</td>
                </tr>`;
              })}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}

if (!customElements.get('picket-radar')) {
  customElements.define('picket-radar', PicketRadar);
}
