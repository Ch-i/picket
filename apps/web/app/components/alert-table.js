import { LitElement, html, css } from 'lit';
import demo from '@picket/client/fixtures/demo.json';

const SEV = { 1: 'high', 2: 'med', 3: 'low' };

/**
 * Dense, framework-agnostic alert table as a Lit web component.
 * Rendered inside an Ember template as <picket-alert-table>.
 * Accepts an `alerts` property; falls back to bundled demo data.
 */
export class PicketAlertTable extends LitElement {
  static properties = {
    alerts: { attribute: false },
    selectedId: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      font:
        13px/1.4 ui-monospace,
        SFMono-Regular,
        Menlo,
        monospace;
      color: #d7dde5;
      background: #0d1117;
      border: 1px solid #1f2937;
      border-radius: 8px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead th {
      text-align: left;
      padding: 8px 10px;
      font-weight: 600;
      color: #8b97a6;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.04em;
      border-bottom: 1px solid #1f2937;
      background: #11161d;
    }
    tbody td {
      padding: 7px 10px;
      border-bottom: 1px solid #161c24;
      white-space: nowrap;
    }
    tbody tr {
      cursor: pointer;
    }
    tbody tr:hover {
      background: #131a22;
    }
    tbody tr[aria-selected='true'] {
      background: #16202b;
      outline: 1px solid #2b6cb0;
    }
    .sev {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 6px;
      vertical-align: middle;
    }
    .high {
      background: #f85149;
    }
    .med {
      background: #d29922;
    }
    .low {
      background: #3fb950;
    }
    .drop {
      color: #f85149;
      font-weight: 600;
    }
    .eng {
      color: #79c0ff;
    }
    .sig {
      color: #e6edf3;
      white-space: normal;
    }
    .muted {
      color: #6b7685;
    }
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
    const rows = [...(this.alerts ?? [])].sort(
      (a, b) => Date.parse(b.ts) - Date.parse(a.ts),
    );
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
                <td>
                  <span class="sev ${SEV[a.severity]}"></span>${SEV[a.severity]}
                </td>
                <td class="muted">${a.ts.replace('T', ' ').replace('Z', '')}</td>
                <td><span class="eng">${a.engine}</span> · ${a.iface}</td>
                <td class=${a.action === 'drop' ? 'drop' : 'muted'}>${a.action}</td>
                <td>
                  ${a.src_ip}${a.src_port ? ':' + a.src_port : ''}
                  <span class="muted">→</span>
                  ${a.dest_ip}${a.dest_port ? ':' + a.dest_port : ''}
                </td>
                <td class="sig">
                  ${a.signature}
                  <span class="muted">· sid:${a.sid}</span>
                </td>
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
