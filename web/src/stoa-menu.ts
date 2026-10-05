import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Mobile menu drawer — a right-slide panel over a dimmed full-screen backdrop.
 *
 * Rendered by <stoa-app> only while the menu is open (mounting the component
 * IS the open state). Closes on: tapping a nav row, tapping the backdrop, or
 * pressing Escape. It never navigates itself — it dispatches:
 *
 *   - `stoa-menu-navigate` { detail: { route } }   nav row tapped → app navigates
 *   - `stoa-menu-close`                            backdrop / Escape → app closes
 *
 * Uses the theme tokens (bg #fafaf7, border #ddddd5) so it reads as part of the
 * light warm theme. Nav rows are >=48px (touch-friendly), title uses the serif.
 */
@customElement("stoa-menu")
export class StoaMenu extends LitElement {
  @property({ type: Boolean }) connected = false;

  private _keyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") this._close();
  };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this._keyHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this._keyHandler);
  }

  private _close() {
    this.dispatchEvent(
      new CustomEvent("stoa-menu-close", { bubbles: true, composed: true })
    );
  }

  private _navigate(route: string) {
    this.dispatchEvent(
      new CustomEvent("stoa-menu-navigate", {
        detail: { route },
        bubbles: true,
        composed: true,
      })
    );
  }

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 1000;
    }
    .backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.35);
    }
    .drawer {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(320px, 85vw);
      display: flex;
      flex-direction: column;
      padding: 20px 16px;
      background: var(--bg, #fafaf7);
      border-left: 1px solid var(--border, #ddddd5);
      box-shadow: -8px 0 24px rgba(0, 0, 0, 0.12);
    }
    .title {
      margin: 0 0 8px 0;
      font-family: var(--font-serif, Georgia, "Times New Roman", serif);
      font-size: 28px;
      font-weight: 500;
      text-transform: lowercase;
      color: var(--text, #111);
    }
    nav {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 12px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      min-height: 48px; /* touch-friendly tap target */
      padding: 0 14px;
      border: none;
      border-radius: 10px;
      background: transparent;
      color: var(--text, #111);
      font-size: 16px;
      font-weight: 500;
      text-align: left;
      cursor: pointer;
    }
    .nav-item:active {
      background: var(--surface2, #e8e8e0);
    }
    .conn {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 48px;
      padding: 0 14px;
      border-top: 1px solid var(--border, #ddddd5);
      color: var(--dim, #8a8a80);
      font-size: 14px;
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
  `;

  render() {
    return html`
      <div class="backdrop" @click=${this._close}></div>
      <aside class="drawer" role="dialog" aria-label="Menu" aria-modal="true">
        <h2 class="title">Research Room</h2>
        <nav>
          <button class="nav-item" @click=${() => this._navigate("/")}>
            Room
          </button>
          <button
            class="nav-item"
            @click=${() => this._navigate("/contributions")}
          >
            Contributions
          </button>
        </nav>
        <div class="conn">
          <span class="dot ${this.connected ? "connected" : ""}"></span>
          <span>${this.connected ? "Connected" : "Disconnected"}</span>
        </div>
      </aside>
    `;
  }
}
