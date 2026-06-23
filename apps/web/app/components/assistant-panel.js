import { LitElement, html, css } from 'lit';
import { runAgent, SUGGESTIONS } from '../lib/demo-agent';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// minimal inline **bold** / `code` renderer
function rich(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p) => {
    if (p.startsWith('**')) return html`<strong>${p.slice(2, -2)}</strong>`;
    if (p.startsWith('`')) return html`<code>${p.slice(1, -1)}</code>`;
    return p;
  });
}

function fmtArgs(args = {}) {
  const e = Object.entries(args);
  return e.length ? e.map(([k, v]) => `${k}=${v}`).join(', ') : '';
}

function fmtResult(r) {
  if (Array.isArray(r)) {
    if (!r.length) return '(0 rows)';
    return r
      .slice(0, 6)
      .map((row) =>
        row && typeof row === 'object'
          ? Object.entries(row)
              .map(([k, v]) => `${k}:${typeof v === 'object' ? JSON.stringify(v) : v}`)
              .join('  ')
          : String(row),
      )
      .join('\n');
  }
  if (r && typeof r === 'object') {
    return Object.entries(r)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join('\n');
  }
  return String(r);
}

export class PicketAssistant extends LitElement {
  static properties = {
    entries: { state: true },
    working: { state: true },
    draft: { state: true },
    live: { state: true },
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      font-family: var(--cl-sans, sans-serif);
      color: var(--cl-ink, #e8e2d6);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 11px 16px;
      border-bottom: 0.5px solid var(--cl-neatline, #2b3340);
      background: var(--cl-panel, #0d1117);
    }
    .title {
      font: 600 10px/1 var(--cl-mono, monospace);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--cl-ink-dim, #a89f8a);
    }
    .meta {
      display: flex;
      align-items: center;
      gap: 10px;
      font: 500 9px/1 var(--cl-mono, monospace);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cl-ink-faint, #6a6357);
    }
    .live {
      display: flex;
      align-items: center;
      gap: 5px;
      color: var(--cl-signal-on, #6cd4f2);
    }
    .live .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--cl-signal-on, #6cd4f2);
      box-shadow: 0 0 7px var(--cl-signal-on, #6cd4f2);
      animation: pulse 2.4s var(--cl-ease, ease) infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .stream {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scrollbar-width: thin;
    }

    .empty {
      margin: auto 0;
      color: var(--cl-ink-faint, #6a6357);
      font: 400 italic 14px/1.6 var(--cl-serif-it, serif);
    }
    .empty b { color: var(--cl-ink-dim, #a89f8a); font-style: normal; }

    .user {
      align-self: flex-end;
      max-width: 88%;
      padding: 8px 12px;
      border: 0.5px solid var(--cl-neatline, #2b3340);
      border-radius: 3px;
      background: #131a22;
      font-size: 13px;
    }

    .say {
      max-width: 92%;
      font-size: 13px;
      line-height: 1.6;
      color: var(--cl-ink, #e8e2d6);
    }
    .say strong { color: var(--cl-signal-on, #6cd4f2); font-weight: 600; }
    .say code {
      font: 500 12px var(--cl-mono, monospace);
      color: var(--cl-ink-dim, #a89f8a);
    }

    .tool {
      border-left: 1.5px solid var(--cl-signal, #34a3c4);
      background: rgba(52, 163, 196, 0.05);
      padding: 7px 11px;
      border-radius: 0 3px 3px 0;
    }
    .tool .head {
      font: 600 10px/1.4 var(--cl-mono, monospace);
      letter-spacing: 0.04em;
      color: var(--cl-signal, #34a3c4);
    }
    .tool .head .args { color: var(--cl-ink-faint, #6a6357); font-weight: 400; }
    .tool pre {
      margin: 5px 0 0;
      font: 400 11px/1.5 var(--cl-mono, monospace);
      color: var(--cl-ink-dim, #a89f8a);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .propose {
      border: 0.5px solid var(--cl-signal, #34a3c4);
      border-left-width: 1.5px;
      border-radius: 3px;
      padding: 10px 12px;
      background: rgba(52, 163, 196, 0.06);
    }
    .propose.danger {
      border-color: var(--cl-alert, #d4543c);
      background: rgba(212, 84, 60, 0.07);
    }
    .propose .lbl {
      font: 600 9px/1 var(--cl-mono, monospace);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--cl-signal, #34a3c4);
    }
    .propose.danger .lbl { color: var(--cl-alert, #d4543c); }
    .propose .summary { font-size: 13px; line-height: 1.5; margin: 6px 0 8px; }
    .propose .call {
      font: 400 11px var(--cl-mono, monospace);
      color: var(--cl-ink-faint, #6a6357);
      margin-bottom: 9px;
      word-break: break-word;
    }
    .propose .actions { display: flex; gap: 8px; }
    button {
      font: 600 10px/1 var(--cl-mono, monospace);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 7px 12px;
      border-radius: 3px;
      border: 0.5px solid var(--cl-neatline, #2b3340);
      background: transparent;
      color: var(--cl-ink-dim, #a89f8a);
      cursor: pointer;
      transition: all var(--cl-dur, 0.2s) var(--cl-ease, ease);
    }
    button.confirm {
      border-color: var(--cl-signal, #34a3c4);
      color: var(--cl-signal-on, #6cd4f2);
    }
    .propose.danger button.confirm {
      border-color: var(--cl-alert, #d4543c);
      color: var(--cl-alert, #d4543c);
    }
    button:hover { background: rgba(255, 255, 255, 0.04); }
    button.confirm:hover { background: rgba(52, 163, 196, 0.12); }
    button:disabled { opacity: 0.5; cursor: default; }

    .applied {
      font: 500 11px/1.5 var(--cl-mono, monospace);
      color: var(--cl-ok, #87a866);
    }

    .working {
      display: flex;
      align-items: center;
      gap: 8px;
      font: 500 10px/1 var(--cl-mono, monospace);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cl-signal, #34a3c4);
    }
    .working .bar {
      width: 26px;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--cl-signal, #34a3c4), transparent);
      background-size: 200% 100%;
      animation: scan 1.1s linear infinite;
    }
    @keyframes scan { from { background-position: 200% 0; } to { background-position: -200% 0; } }

    .dock {
      border-top: 0.5px solid var(--cl-neatline, #2b3340);
      padding: 12px 14px;
      background: var(--cl-panel, #0d1117);
    }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .chip {
      font: 400 11px var(--cl-sans, sans-serif);
      padding: 5px 9px;
      border: 0.5px solid var(--cl-neatline, #2b3340);
      border-radius: 100px;
      color: var(--cl-ink-dim, #a89f8a);
      cursor: pointer;
      transition: all var(--cl-dur, 0.2s) var(--cl-ease, ease);
      text-transform: none;
      letter-spacing: 0;
    }
    .chip:hover { border-color: var(--cl-signal, #34a3c4); color: var(--cl-ink, #e8e2d6); }
    .field { display: flex; gap: 8px; align-items: flex-end; }
    textarea {
      flex: 1;
      resize: none;
      min-height: 38px;
      max-height: 120px;
      padding: 9px 11px;
      border: 0.5px solid var(--cl-neatline, #2b3340);
      border-radius: 3px;
      background: var(--cl-paper, #0a0d12);
      color: var(--cl-ink, #e8e2d6);
      font: 400 13px/1.4 var(--cl-sans, sans-serif);
      outline: none;
    }
    textarea:focus { border-color: var(--cl-signal, #34a3c4); }
    .send {
      border-color: var(--cl-signal, #34a3c4);
      color: var(--cl-signal-on, #6cd4f2);
      align-self: stretch;
    }
  `;

  constructor() {
    super();
    this.entries = [];
    this.working = false;
    this.draft = '';
    this.live = false; // flips to true if a backend with a key is reachable
    this.sessionId = (globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}`);
  }

  async connectedCallback() {
    super.connectedCallback();
    // Probe for the ll0d backend; if it's there with a key, go live (real Claude).
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      if (r.ok) {
        const h = await r.json();
        this.live = !!h.hasKey;
      }
    } catch {
      this.live = false; // static deploy (e.g. GitHub Pages) → demo agent
    }
  }

  #push(entry) {
    this.entries = [...this.entries, entry];
  }

  async #liveSteps(message) {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId, message }),
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    return data.steps;
  }

  async #send(text) {
    const msg = (text ?? this.draft).trim();
    if (!msg || this.working) return;
    this.draft = '';
    this.#push({ type: 'user', text: msg });
    this.working = true;
    await wait(220);
    let steps;
    try {
      steps = this.live ? await this.#liveSteps(msg) : runAgent(msg);
    } catch (e) {
      steps = [{ kind: 'say', text: `⚠ ${e?.message ?? e}` }];
    }
    for (const step of steps) {
      await wait(step.kind === 'tool' ? 480 : 360);
      this.#push({ type: step.kind, ...step });
    }
    this.working = false;
  }

  #confirm(entry) {
    entry.applied = true;
    this.#push({
      type: 'say',
      text: `✓ **Applied** (demo): \`${entry.tool}(${fmtArgs(entry.args)})\` — in production this routes through the MCP write tool, gated by \`PICKET_ALLOW_WRITES\`.`,
      ok: true,
    });
  }

  updated() {
    const s = this.renderRoot.querySelector('.stream');
    if (s) s.scrollTop = s.scrollHeight;
  }

  #renderEntry(e) {
    switch (e.type) {
      case 'user':
        return html`<div class="user">${e.text}</div>`;
      case 'tool':
        return html`
          <div class="tool">
            <div class="head">▸ ${e.tool}<span class="args">(${fmtArgs(e.args)})</span></div>
            <pre>${fmtResult(e.result)}</pre>
          </div>
        `;
      case 'say':
        return html`<div class="say ${e.ok ? 'applied' : ''}">${rich(e.text)}</div>`;
      case 'propose':
        return html`
          <div class="propose ${e.danger ? 'danger' : ''}">
            <div class="lbl">${e.danger ? 'Proposed change · review' : 'Proposed action'}</div>
            <div class="summary">${rich(e.summary)}</div>
            <div class="call">${e.tool}(${fmtArgs(e.args)})</div>
            <div class="actions">
              ${e.applied
                ? html`<span class="applied">✓ applied</span>`
                : e.dismissed
                  ? html`<span class="applied" style="color:var(--cl-ink-faint)">✕ dismissed</span>`
                  : html`
                      <button class="confirm" @click=${() => this.#confirm(e)}>Confirm</button>
                      <button
                        @click=${() => {
                          e.dismissed = true;
                          this.requestUpdate();
                        }}
                      >
                        Dismiss
                      </button>
                    `}
            </div>
          </div>
        `;
      default:
        return null;
    }
  }

  render() {
    return html`
      <header>
        <span class="title">Assistant</span>
        <div class="meta">
          <span>MCP · 7 tools</span>
          <span class="live"><span class="dot"></span>${this.live ? 'live' : 'demo'}</span>
        </div>
      </header>

      <div class="stream">
        ${this.entries.length === 0
          ? html`<div class="empty">
              Ask the firewall a question. I query the live Suricata/Snort feed over
              <b>MCP tools</b>, correlate, and propose actions — every change gated behind your confirmation.
            </div>`
          : this.entries.map((e) => this.#renderEntry(e))}
        ${this.working
          ? html`<div class="working"><span class="bar"></span>querying feed…</div>`
          : null}
      </div>

      <div class="dock">
        <div class="chips">
          ${SUGGESTIONS.map(
            (s) => html`<span class="chip" @click=${() => this.#send(s)}>${s}</span>`,
          )}
        </div>
        <div class="field">
          <textarea
            placeholder="Ask about alerts, rules, interfaces…"
            .value=${this.draft}
            @input=${(ev) => (this.draft = ev.target.value)}
            @keydown=${(ev) => {
              if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                this.#send();
              }
            }}
          ></textarea>
          <button class="send" @click=${() => this.#send()}>Send</button>
        </div>
      </div>
    `;
  }
}

if (!customElements.get('picket-assistant')) {
  customElements.define('picket-assistant', PicketAssistant);
}
