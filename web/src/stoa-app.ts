import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import Navigo from "navigo";

// Consume the shared protocol module by package name — esbuild aliases
// @stoa/shared → shared/src and bundles the raw TypeScript source into app.js.
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
} from "@stoa/shared";

import "./stoa-header.js";
import "./stoa-transcript.js";
import "./stoa-composer.js";
import "./stoa-contributions.js";

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

  // Current routed view. navigo (hash mode) is owned here — the router root —
  // and route changes only swap which view renders below. The single WS
  // connection and ALL streaming state live in this component, so navigating
  // never re-opens the socket, drops entries, or loses the live answer.
  @state() private _route: string = "/";

  private _ws: WebSocket | null = null;
  private _router: Navigo | null = null;
  private _interruptCheckInterval: ReturnType<typeof setInterval> | null = null;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        sans-serif;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this._connect();
    this._initRouter();
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
    if (this._router) {
      this._router.destroy();
      this._router = null;
    }
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }

  // ── Router (navigo, hash mode)
  //
  // Hash-based routing (useHash) so /#/ and /#/contributions deep-link on
  // static hosting with zero server rewrites. navigo's constructor for v8 is
  // new Navigo(root, { hash: true }) — the v8 spelling of v7's useHash flag.
  //
  // The router only updates this._route; rendering is a plain conditional
  // below. Because the WebSocket + state live here (never torn down), both
  // in-app navigation and browser back/forward (popstate → resolve) preserve
  // the single connection and streaming state.
  private _initRouter() {
    const router = new Navigo("/", { hash: true });
    router.on({
      "/": () => {
        this._route = "/";
        this.requestUpdate();
      },
      "/contributions": () => {
        this._route = "/contributions";
        this.requestUpdate();
      },
    });
    // Resolve the current URL once — handles direct load of /#/contributions.
    router.resolve();
    this._router = router;
  }

  // ── Navigation handlers (child events → router)
  private _onNavContributions() {
    this._router?.navigate("/contributions");
  }

  private _onBack() {
    this._router?.navigate("/");
  }

  // ── WebSocket
  private _connect() {
    // WS URL: ?ws= query override || window.STOA_WS_URL || DEFAULT_WS_URL
    const params = new URLSearchParams(location.search);
    const WS_URL = this._normalizeWsUrl(
      params.get("ws") || (window as any).STOA_WS_URL || DEFAULT_WS_URL
    );

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
        // B1 fix: reassign a FRESH object per delta so the property reference
        // changes and <stoa-transcript> re-renders (Lit's default hasChanged is
        // Object.is, so mutating .text in place on the same object never triggers
        // the child). Keep the same { text: string } shape the component expects.
        this._liveGeneration = {
          text: (this._liveGeneration?.text ?? "") + msg.text,
        };
        this.requestUpdate();
      } else if (isTool(msg)) {
        this._liveTools.set(msg.id, { name: msg.name, output: msg.output });
        this._toolsVersion++;
        this.requestUpdate();
      } else if (isSources(msg)) {
        if (msg.refs && msg.refs.length) {
          // B2 fix: reassign _entries to a fresh array with fresh element
          // references so the `entries` property reference changes and the child
          // re-renders (mutating entry.sources in place on the same array/element
          // never triggers the child). The repeat() keyed by id then re-renders
          // the touched messages and their source chips.
          const updated = this._entries.map((e) => ({ ...e }));
          for (const ref of msg.refs as any[]) {
            const entry = updated.find((e) => e.id === ref.answerEntryId);
            if (entry) {
              entry.sources = [
                ...(entry.sources || []),
                ...ref.contributionIds,
              ];
            }
          }
          this._entries = updated;
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

  // The server accepts WebSocket upgrades ONLY on the /ws path. Normalize the
  // resolved URL so a bare host (pathname "" or "/") — e.g. the config.js
  // default or a ?ws= override without the path — still reaches /ws. A URL that
  // already has the /ws path (or any other explicit path) is left untouched,
  // so the path is never appended twice.
  private _normalizeWsUrl(url: string): string {
    try {
      const u = new URL(url);
      if (u.pathname === "" || u.pathname === "/") {
        u.pathname = "/ws";
      }
      return u.toString();
    } catch {
      // Not an absolute URL — WebSocket() will resolve it against the page
      // origin as before. Leave untouched (zero behavior change).
      return url;
    }
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
    // Route changes only swap which view renders — the socket and state above
    // are untouched, so / → /contributions → / preserves entries, live tools,
    // and the streaming answer. /contributions re-mounts <stoa-transcript>
    // fresh on the way back, re-fed from this._entries/_liveGeneration.
    if (this._route === "/contributions") {
      return html`
        <stoa-contributions @stoa-back=${this._onBack}></stoa-contributions>
      `;
    }
    return html`
      <stoa-header
        title="Research Room"
        .connected=${this._connected}
        @stoa-nav-contributions=${this._onNavContributions}
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
    `;
  }
}
