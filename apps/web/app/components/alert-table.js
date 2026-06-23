import { LitElement, html, css } from 'lit';
import demo from '@picket/client/fixtures/demo.json';

const SEV = { 1: 'high', 2: 'med', 3: 'low' };

/**
 * Dense, framework-agnostic alert table as a Lit web component, styled with the
 * shared cl-* instrument tokens. Rendered inside an Ember template as
 * <picket-alert-table>; accepts an `alerts` property, falls back to demo data.
 */
export class PicketAlertTable extends LitElement {
  static properties = {
    alerts: { attribute: false },
    selectedId: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      font: 400 12px/1.4 var(--cl-mono, ui-monospace, monospace);
      color: var(--cl-ink, #e8e2d6);
      background: var(--cl-panel, #0d1117);
      border: 0.5px solid var(--cl-neatline, #2b3340);
      border-radius: 4px;
      overflow: hidden;
    }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      text-align: left;
      padding: 8px 10px;
      font: 500 9px/1 var(--cl-mono, monospace);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--cl-ink-faint, #6a6357);
      border-bottom: 0.5px solid var(--cl-neatline, #2b3340);
      background: var(--cl-panel-2, #11161d);
    }
    tbody td {
      padding: 7px 10px;
      border-bottom: 0.5px solid var(--cl-rule, #1a212b);
      white-space: nowrap;
    }
    tbody tr { cursor: pointer; transition: background var(--cl-dur, 0.2s) var(--cl-ease, ease); }
    tbody tr:hover { background: rgba(255, 255, 255, 0.025); }
    tbody tr[aria-selected='true'] {
      background: rgba(52, 163, 196, 0.08);
      outline: 0.5px solid var(--cl-signal, #34a3c4);
      outline-offset: -1px;
    }
    .sev {
      display: inline-block;
      width: 7px; height: 7px;
      border-radius: 50%;
      margin-right: 6px;
      vertical-align: middle;
    }
    .high { background: var(--cl-alert, #d4543c); }
    .med { background: var(--cl-signal-warn, #d27238); }
    .low { background: var(--cl-ok, #87a866); }
    .drop { color: var(--cl-alert, #d4543c); font-weight: 500; }
    .eng { color: var(--cl-signal, #34a3c4); }
    .sig { color: var(--cl-ink, #e8e2d6); white-space: normal; }
    .muted { color: var(--cl-ink-faint, #6a6357); }
  `;

  constructor() {
    super();
    this.alerts = demo.alerts;
    this.selectedId = null;
  }

  #select(a) {
    this.selectedId = a.id;
    this.dispatchEvent(
      new CustomEvent('alert-select', { detail: a, bubbles: true, composed: true }),
    );
  }

  render() {
    const rows = [...(this.alerts ?? [])].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
    return html`
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Time</th>
            <th>Engine / IF</th>
            <th>Action</th>
            <th>Source → Dest</th>
            <th>Signature</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(
            (a) => html`
              <tr
                aria-selected=${a.id === this.selectedId ? 'true' : 'false'}
                tabindex="0"
                @click=${() => this.#select(a)}
                @keydown=${(e) => (e.key === 'Enter' ? this.#select(a) : null)}
              >
                <td><span class="sev ${SEV[a.severity]}"></span>${SEV[a.severity]}</td>
                <td class="muted">${a.ts.replace('T', ' ').replace('Z', '')}</td>
                <td><span class="eng">${a.engine}</span> · ${a.iface}</td>
                <td class=${a.action === 'drop' ? 'drop' : 'muted'}>${a.action}</td>
                <td>
                  ${a.src_ip}${a.src_port ? ':' + a.src_port : ''}
                  <span class="muted">→</span>
                  ${a.dest_ip}${a.dest_port ? ':' + a.dest_port : ''}
                </td>
                <td class="sig">${a.signature}<span class="muted"> · sid:${a.sid}</span></td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `;
  }
}

if (!customElements.get('picket-alert-table')) {
  customElements.define('picket-alert-table', PicketAlertTable);
}
