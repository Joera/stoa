import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Mobile-minimal room header.
 *
 * Just the room title (large lowercase serif) + a connection dot + a hamburger
 * that opens the menu drawer (stoa-menu). The old text status pill and the
 * 'Contributions' nav-link are gone — navigation now lives in the menu screen.
 */
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
      background: var(--surface, #f2f2ec);
      border-bottom: 1px solid var(--border, #ddddd5);
    }
    h2 {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-family: var(--font-serif, Georgia, "Times New Roman", serif);
      font-size: 32px;
      font-weight: 500;
      text-transform: lowercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #c0c0b8; /* disconnected */
    }
    .dot.connected {
      background: var(--green, #00b894);
    }
    #menu-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px; /* tap target */
      height: 40px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--text, #111);
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
    }
    #menu-btn:active {
      opacity: 0.7;
    }
  `;

  private _onMenu() {
    this.dispatchEvent(
      new CustomEvent("stoa-menu-open", { bubbles: true, composed: true })
    );
  }

  render() {
    return html`
      <h2>${this.title}</h2>
      <div id="actions">
        <span
          class="dot ${this.connected ? "connected" : ""}"
          aria-label=${this.connected ? "Connected" : "Disconnected"}
          title=${this.connected ? "Connected" : "Disconnected"}
        ></span>
        <button id="menu-btn" aria-label="Open menu" @click=${this._onMenu}>
          ☰
        </button>
      </div>
    `;
  }
}
