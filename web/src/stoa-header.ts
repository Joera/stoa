import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("stoa-header")
export class StoaHeader extends LitElement {
  @property({ type: String }) title = "Research Room";
  @property({ type: Boolean }) connected = false;

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px;
      background: var(--surface, #fff);
      border-bottom: 1px solid var(--border, #111);
    }
    h2 {
      font-size: 16px;
      margin: 0;
      font-family: var(--font-serif, Georgia, "Times New Roman", serif);
    }
    #actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .nav-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px; /* touch-friendly tap target */
      padding: 0 14px;
      border-radius: 8px;
      border: 1px solid var(--border, #2a2a4a);
      background: var(--surface2, #0f3460);
      color: var(--text, #e6e6e6);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .nav-link:active {
      opacity: 0.8;
    }
    #status {
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 12px;
      white-space: nowrap;
    }
    #status.connected {
      background: var(--green, #00b894);
      color: #111;
    }
    #status.disconnected {
      background: var(--accent, #e94560);
      color: #fff;
    }
  `;

  private _onContributions() {
    this.dispatchEvent(
      new CustomEvent("stoa-nav-contributions", {
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    return html`
      <h2>${this.title}</h2>
      <div id="actions">
        <span id="status" class=${this.connected ? "connected" : "disconnected"}>
          ${this.connected ? "connected" : "disconnected"}
        </span>
        <button class="nav-link" @click=${this._onContributions}>
          Contributions
        </button>
      </div>
    `;
  }
}
