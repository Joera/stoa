import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import "./stoa-message.js";

@customElement("stoa-transcript")
export class StoaTranscript extends LitElement {
  @property({ type: Array }) entries: Array<{
    id: string; role: string; content: string; sources?: string[];
  }> = [];

  @property({ type: Object }) liveGeneration: { text: string } | null = null;

  @property({ type: Object }) liveTools: Map<string, { name: string; output: string }> = new Map();

  @property({ type: Number }) _toolsVersion = 0;

  private _observer: MutationObserver | null = null;

  static styles = css`
    :host {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .streaming {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      background: var(--assistant-bubble, #16213e);
      border-left: 3px solid var(--accent, #e94560);
      display: none;
    }
    .streaming.active {
      display: block;
    }
    .tool-progress {
      margin: 0 auto;
      max-width: 80%;
      background: var(--border, #2a2a4a);
      font-size: 12px;
      font-family: monospace;
      padding: 8px 12px;
      border-radius: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }
  `;

  updated(changed: Map<string, unknown>) {
    // scroll to bottom after render
    this.scrollTop = this.scrollHeight;
  }

  render() {
    return html`
      ${repeat(
        this.entries,
        (e) => e.id,
        (e) =>
          html`<stoa-message
            .role=${e.role}
            .content=${e.content}
            .sources=${e.sources || []}
          ></stoa-message>`
      )}

      ${this.liveTools.size > 0
        ? html`
            ${Array.from(this.liveTools.entries()).map(
              ([id, info]) => html`
                <div class="tool-progress">${info.name}: ${info.output}</div>
              `
            )}
          `
        : nothing}

      <div
        class="streaming ${this.liveGeneration && this.liveGeneration.text
          ? "active"
          : ""}"
      >
        ${this.liveGeneration ? this.liveGeneration.text : ""}
      </div>
    `;
  }
}
