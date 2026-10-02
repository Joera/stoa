// Stoa frontend — configurable WebSocket URL
// The server accepts WebSocket upgrades only on the /ws path. stoa-app._connect()
// normalizes a bare host (no path) to /ws, so this default and any ?ws= override
// may include the path or omit it — either way the /ws endpoint is reached.
// Override with ?ws=wss://myhost:8080/ws in the URL, or set window.STOA_WS_URL
// before loading.
window.STOA_WS_URL = "ws://localhost:8080/ws";
