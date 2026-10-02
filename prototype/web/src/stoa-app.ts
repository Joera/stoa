import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

// Consume the shared protocol module for message construction and recognition.
// Marked external in esbuild — the browser loads /shared/protocol.js at runtime.
import {
  DEFAULT_WS_URL,
  makeJoin,
  makeSubmit,
  makeInterrupt,
  isView,
  isCommit,
  isAnswerDelta,
  isTool,
  isSources,
  isError,
} from "/shared/protocol.js";

import "./stoa-header.js";
import "./stoa-rail.js";
import "./stoa-transcript.js";
import "./stoa-composer.js";

interface Entry {
  id: string;
  role: string;
  content: string;
  sources: string[];
}

@customElement("stoa-app")
export class StoaApp extends LitElement {
  // ── State
  @state() private _connected = false;
  @state() private _entries: Entry[] = [];
  @state() private _liveGeneration: { text: string } | null = null;
  @state() private _liveTools: Map<string, { name: string; output: string }> =
    new Map();
  @state() private _toolsVersion = 0;

  private _ws: WebSocket | null = null;
  private _interruptCheckInterval: ReturnType<typeof setInterval> | null = null;

  static styles = css`
    :host {
      display: flex;
      height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        sans-serif;
    }
    #main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this._connect();
    // Poll for interrupt button state (enabled while liveGeneration is active)
    this._interruptCheckInterval = setInterval(() => {
      this.requestUpdate();
    }, 500);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._interruptCheckInterval) {
      clearInterval(this._interruptCheckInterval);
      this._interruptCheckInterval = null;
    }
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }

  // ── WebSocket
  private _connect() {
    // WS URL: ?ws= query override || window.STOA_WS_URL || DEFAULT_WS_URL
    const params = new URLSearchParams(location.search);
    const WS_URL =
      params.get("ws") || (window as any).STOA_WS_URL || DEFAULT_WS_URL;

    this._ws = new WebSocket(WS_URL);

    this._ws.onopen = () => {
      this._connected = true;
      this._ws!.send(JSON.stringify(makeJoin("main")));
    };

    this._ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (isView(msg)) {
        const snap = msg.snapshot;
        this._entries = (snap.entries || []).map((e: any) => ({
          ...e,
          sources: [],
        }));
        this._liveGeneration = snap.live?.generation || null;
        this._liveTools.clear();
        if (snap.live?.tools) {
          for (const t of snap.live.tools) this._liveTools.set(t.id, t);
        }
        this._toolsVersion++;
        this.requestUpdate();
      } else if (isCommit(msg)) {
        if (msg.ops) {
          for (const op of msg.ops as any[]) {
            if (op.op === "replace" && op.path === "/entries") {
              this._entries = (op.value || []).map((e: any) => ({
                ...e,
                sources: [],
              }));
            }
          }
        }
        this.requestUpdate();
      } else if (isAnswerDelta(msg)) {
        if (!this._liveGeneration) this._liveGeneration = { text: "" };
        this._liveGeneration.text += msg.text;
        this.requestUpdate();
      } else if (isTool(msg)) {
        this._liveTools.set(msg.id, { name: msg.name, output: msg.output });
        this._toolsVersion++;
        this.requestUpdate();
      } else if (isSources(msg)) {
        if (msg.refs && msg.refs.length) {
          for (const ref of msg.refs as any[]) {
            const entry = this._entries.find(
              (e) => e.id === ref.answerEntryId
            );
            if (entry) {
              entry.sources = [
                ...(entry.sources || []),
                ...ref.contributionIds,
              ];
            }
          }
        }
        this.requestUpdate();
      } else if (isError(msg)) {
        console.error("Server error:", msg.message);
      }
    };

    this._ws.onclose = () => {
      this._connected = false;
      this.requestUpdate();
      setTimeout(() => this._connect(), 2000);
    };

    this._ws.onerror = () => {
      this._ws?.close();
    };
  }

  // ── Handlers from child events
  private _onSubmit(e: CustomEvent) {
    const text = e.detail.text;
    if (!text || !this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    this._ws.send(
      JSON.stringify(
        makeSubmit(text, crypto.randomUUID?.() ?? Date.now().toString())
      )
    );
  }

  private _onInterrupt() {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    this._ws.send(JSON.stringify(makeInterrupt()));
  }

  render() {
    return html`
      <stoa-rail></stoa-rail>
      <div id="main">
        <stoa-header
          title="Stoa Room"
          .connected=${this._connected}
        ></stoa-header>
        <stoa-transcript
          .entries=${this._entries}
          .liveGeneration=${this._liveGeneration}
          .liveTools=${this._liveTools}
          ._toolsVersion=${this._toolsVersion}
        ></stoa-transcript>
        <stoa-composer
          ?interrupt-enabled=${!!this._liveGeneration}
          @stoa-submit=${this._onSubmit}
          @stoa-interrupt=${this._onInterrupt}
        ></stoa-composer>
      </div>
    `;
  }
}
