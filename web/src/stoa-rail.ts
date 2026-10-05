import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("stoa-rail")
export class StoaRail extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 260px;
      background: var(--surface, #fff);
      border-right: 1px solid var(--border, #fff);
      padding: 16px;
      overflow-y: auto;
      flex-shrink: 0;
    }
    h3 {
      font-size: 13px;
      color: var(--dim, #111);
      margin: 0 0 12px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .contrib-card {
      background: var(--surface2, #111);
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 8px;
      font-size: 12px;
    }
    .contrib-card .title {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .contrib-card .meta {
      color: var(--dim, #111);
      font-size: 11px;
    }
  `;

  render() {
    return html`
      <h3>Contributions</h3>
      <div class="contrib-card">
        <div class="title">Stoa Spec</div>
        <div class="meta">Anyone · Combinable · No expiry</div>
      </div>
      <div class="contrib-card">
        <div class="title">Pi Durable Docs</div>
        <div class="meta">Anyone · Quote-only · No expiry</div>
      </div>
    `;
  }
}
