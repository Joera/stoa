import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("stoa-message")
export class StoaMessage extends LitElement {
  @property({ type: String }) role: string = "user";
  @property({ type: String }) content: string = "";
  @property({ type: Array }) sources: string[] = [];

  static styles = css`
    :host {
      display: block;
    }
    .msg {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .msg.user {
      margin-left: auto;
      background: var(--user-bubble, #0f3460);
    }
    .msg.assistant {
      background: var(--assistant-bubble, #16213e);
    }
    .msg.system {
      margin: 0 auto;
      background: none;
      color: var(--dim, #8892a4);
      font-size: 12px;
      font-style: italic;
    }
    .msg.tool {
      margin: 0 auto;
      background: var(--border, #2a2a4a);
      font-size: 12px;
      font-family: monospace;
    }
    .sources {
      margin-top: 6px;
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .source-chip {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--accent2, #533483);
      color: #fff;
    }
  `;

  render() {
    return html`
      <div class="msg ${this.role}">
        ${this.content || "(empty)"}
        ${this.sources.length > 0
          ? html`
              <div class="sources">
                ${this.sources.map(
                  (s) => html`<span class="source-chip">↗ ${s}</span>`
                )}
              </div>
            `
          : ""}
      </div>
    `;
  }
}
