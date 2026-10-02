import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("stoa-header")
export class StoaHeader extends LitElement {
  @property({ type: String }) title = "Stoa Room";
  @property({ type: Boolean }) connected = false;

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      background: var(--surface, #16213e);
      border-bottom: 1px solid var(--border, #2a2a4a);
    }
    h2 {
      font-size: 16px;
      margin: 0;
    }
    #status {
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 12px;
    }
    #status.connected {
      background: var(--green, #00b894);
      color: #000;
    }
    #status.disconnected {
      background: var(--accent, #e94560);
      color: #fff;
    }
  `;

  render() {
    return html`
      <h2>${this.title}</h2>
      <span id="status" class=${this.connected ? "connected" : "disconnected"}>
        ${this.connected ? "connected" : "disconnected"}
      </span>
    `;
  }
}
