import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * Message composer — just an input + Send button now.
 *
 * The old ⏹ stop button and its enabled-state plumbing were removed as part of
 * the mobile-first header redesign; the stop control is no longer surfaced in
 * the room chrome. Input keeps 16px font-size (>=16px prevents iOS auto-zoom).
 */
@customElement("stoa-composer")
export class StoaComposer extends LitElement {
  static styles = css`
    :host {
      display: flex;
      gap: 8px;
      padding: 12px 20px;
      background: var(--surface, #f2f2ec);
      border-top: 1px solid var(--border, #ddddd5);
    }
    input {
      flex: 1;
      min-width: 0;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid var(--border, #ddddd5);
      background: var(--bg, #fafaf7);
      color: var(--text, #111);
      font-size: 16px; /* >=16px prevents iOS auto-zoom on focus */
      outline: none;
    }
    input:focus {
      border-color: var(--accent, #e94560);
    }
    #send-btn {
      flex-shrink: 0;
      padding: 10px 18px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      background: var(--accent, #e94560);
      color: #fff;
    }
  `;

  private _onSend() {
    const input = this.shadowRoot?.querySelector("input") as HTMLInputElement;
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    this.dispatchEvent(
      new CustomEvent("stoa-submit", { detail: { text }, bubbles: true, composed: true })
    );
    input.value = "";
  }

  private _onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") this._onSend();
  }

  render() {
    return html`
      <input
        type="text"
        placeholder="Ask a question..."
        @keydown=${this._onKeyDown}
      />
      <button id="send-btn" @click=${this._onSend}>Send</button>
    `;
  }
}
