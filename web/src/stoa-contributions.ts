import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * Full-page contributions view (mobile-first). This is the successor to the
 * old fixed 260px <stoa-rail> side pane: the same static contribution cards,
 * moved onto their own routed page (/contributions) so the room view is a
 * single-column, full-width mobile layout.
 *
 * Route changes are handled by the router in <stoa-app> — this component only
 * dispatches a `stoa-back` event that the app turns into router.navigate("/").
 * No live contribution-data wiring here (kept static per the task scope).
 */
@customElement("stoa-contributions")
export class StoaContributions extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0; /* allow the page body to scroll instead of the host */
      background: var(--bg, #fafaf7);
    }
    header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: var(--surface, #f2f2ec);
      border-bottom: 1px solid var(--border, #ddddd5);
      flex-shrink: 0;
    }
    h2 {
      font-size: 16px;
      margin: 0;
      font-family: var(--font-serif, Georgia, "Times New Roman", serif);
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px; /* touch-friendly tap target */
      padding: 0 14px;
      border-radius: 8px;
      border: 1px solid var(--border, #ddddd5);
      background: var(--surface2, #e8e8e0);
      color: var(--text, #111);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .back-link:active {
      opacity: 0.8;
    }
    #content {
      flex: 1;
      overflow-y: auto;
      width: 100%;
      max-width: 720px;
      margin: 0 auto;
      padding: 20px 16px 32px;
    }
    h3 {
      font-size: 13px;
      color: var(--dim, #8a8a80);
      margin: 0 0 12px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .contrib-card {
      background: var(--surface2, #e8e8e0);
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 10px;
      font-size: 14px;
    }
    .contrib-card .title {
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 6px;
    }
    .contrib-card .meta {
      color: var(--dim, #8a8a80);
      font-size: 12px;
    }
  `;

  private _onBack() {
    this.dispatchEvent(
      new CustomEvent("stoa-back", { bubbles: true, composed: true })
    );
  }

  render() {
    return html`
      <header>
        <button class="back-link" @click=${this._onBack}>← Back to Room</button>
        <h2>Contributions</h2>
      </header>
      <div id="content">
        <h3>Contributions</h3>
        <div class="contrib-card">
          <div class="title">Stoa Spec</div>
          <div class="meta">Anyone · Combinable · No expiry</div>
        </div>
        <div class="contrib-card">
          <div class="title">Pi Durable Docs</div>
          <div class="meta">Anyone · Quote-only · No expiry</div>
        </div>
      </div>
    `;
  }
}
