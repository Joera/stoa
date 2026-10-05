import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("stoa-composer")
export class StoaComposer extends LitElement {
  @property({ type: Boolean }) interrupting = false;
  @property({ type: Boolean, attribute: "interrupt-enabled" }) interruptEnabled = false;

  static styles = css`
    :host {
      display: flex;
      gap: 8px;
      padding: 12px 20px;
      background: var(--surface, #16213e);
      border-top: 1px solid var(--border, #2a2a4a);
    }
    input {
      flex: 1;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid var(--border, #2a2a4a);
      background: var(--bg, #1a1a2e);
      color: var(--text, #e6e6e6);
      font-size: 16px; /* >=16px prevents iOS auto-zoom on focus */
      outline: none;
    }
    input:focus {
      border-color: var(--accent, #e94560);
    }
    button {
      padding: 10px 18px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
    }
    #send-btn {
      background: var(--accent, #e94560);
      color: #fff;
    }
    #interrupt-btn {
      background: var(--border, #2a2a4a);
      color: var(--text, #e6e6e6);
    }
    #interrupt-btn:disabled {
      opacity: 0.5;
      cursor: default;
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

  private _onInterrupt() {
    this.dispatchEvent(
      new CustomEvent("stoa-interrupt", { bubbles: true, composed: true })
    );
  }

  render() {
    return html`
      <input
        type="text"
        placeholder="Ask a question..."
        @keydown=${this._onKeyDown}
      />
      <button id="send-btn" @click=${this._onSend}>Send</button>
      <button
        id="interrupt-btn"
        ?disabled=${!this.interruptEnabled}
        @click=${this._onInterrupt}
      >
        ⏹ Interrupt
      </button>
    `;
  }
}
