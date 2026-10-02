// Stoa frontend — configurable WebSocket URL
// The server accepts WebSocket upgrades only on the /ws path. stoa-app._connect()
// normalizes a bare host (no path) to /ws, so this default and any ?ws= override
// may include the path or omit it — either way the /ws endpoint is reached.
// Override with ?ws=wss://myhost:8080/ws in the URL, or set window.STOA_WS_URL
// before loading.
//
// Default: derive the WS host from the page's own hostname so the app works
// when viewed over the network (e.g. Tailscale) — `localhost` when served
// locally, the tailnet hostname when served remotely. Port 8080 and the /ws
// path are fixed (config.js is a plain browser script, so `location` is
// available at load time). The ?ws= query override still wins (checked first
// in _connect()); this is only the fallback default.
window.STOA_WS_URL = `ws://${location.hostname}:8080/ws`;
