# Default WS URL derives from page hostname — Fix Report

**Branch:** `fix-ws-host-derived` (off `main` @ `84791a6`)
**PR:** `fix-ws-host-derived` → `main` (title: "fix: default WS URL derives from page hostname (remote-view friendly)")
**Date:** 2026-10-02
**Scope:** SMALL, SINGLE-CONCERN FIX — zero other behavior change. Only `web/config.js`
edited. `server/` and `shared/` untouched (READ-ONLY).

## Root cause

The web SPA is served statically on :8081, while the WS backend is `server/` on :8080
(upgrades accepted **only** on `/ws`). The browser default WS URL was hardcoded to
`ws://localhost:8080/ws` in `web/config.js`. When the page is viewed from a browser on
the **same** machine as the server, `localhost` is correct. But when viewed over the
network — e.g. from another machine on the same Tailscale tailnet at
`http://bill.hippogryph-goldeye.ts.net:8081` — `localhost` resolves to the **viewer's**
machine, so the browser tries `ws://localhost:8080/ws` on the wrong host and never
connects. The tailnet path itself is fine (`ws://bill.hippogryph-goldeye.ts.net:8080/ws`
completes the join → view handshake); only the *default* was wrong.

## Chosen fix + why

Derive the default WS host from the page's own hostname at load time
(`web/config.js`, line 14):

```js
window.STOA_WS_URL = `ws://${location.hostname}:8080/ws`;
```

Why this shape:
- **Same-host-aware by construction.** `location.hostname` is `localhost` when the page
  is served locally (→ `ws://localhost:8080/ws`) and the tailnet hostname when served
  remotely (→ `ws://bill.hippogryph-goldeye.ts.net:8080/ws`). No per-machine config.
- **Port 8080 and the `/ws` path stay fixed** — they are server-deployed constants, not
  viewer-dependent.
- **`config.js` is a plain browser script** loaded by `index.html` before the module
  bundle, so `location` is available at load time (no module/`import.meta.url` gymnastics).
- **`?ws=` override still wins.** `_connect()` in `web/src/stoa-app.ts` checks the query
  param first (`params.get("ws") || window.STOA_WS_URL || DEFAULT_WS_URL`) — that ordering
  is **unchanged**. This config.js value is only the fallback default.
- **`_normalizeWsUrl()` untouched (safety net).** It still normalizes a bare host to `/ws`,
  never double-appends (the derived URL already carries `/ws` and is left alone), and keeps
  its `try/catch` fallback. Zero behavior change.
- **`shared/` untouched.** `DEFAULT_WS_URL` keeps its localhost literal as a pure fallback;
  it is shadowed by `window.STOA_WS_URL` in practice.
- **No TLS/wss, no new features** — out of scope.

## Acceptance gates

| # | Gate | Exact command | Result |
|---|------|---------------|--------|
| 1 | Web bundle builds | `pnpm -C web run build` | ✅ `Built: .../web/dist/app.js` (exit 0) |
| 2a | Server typecheck 0 errors | `pnpm -C server run typecheck` | ✅ exit 0, 0 errors (after `pnpm -C shared run build` — fresh worktree had no `shared/dist`; build artifacts are gitignored) |
| 2b | Server smoke (server untouched) | `pnpm -C server run smoke` | ✅ **12 passed, 0 failed** (boots its own :19876 instance; live :8080 untouched) |
| 3 | Functional proof | `node .ws-host-proof-tmp.mjs` (then removed) | ✅ see below |
| 4 | Bundle sanity | `grep` of `web/config.js` + `web/dist/app.js` | ✅ derived construction `location.hostname` in served `config.js`; `_normalizeWsUrl` in bundle; `shared` fallback intact |
| 5 | Repo hygiene | `git status` / `git diff` | ✅ only `web/config.js` modified; no stray files; no API keys |

### Gate 3 — functional proof (stubbed `location.hostname` + live tailnet handshake)

Evaluated the exact `config.js` expression under stubbed `location` objects, then ran a
real `ws` client against the **running** :8080 server over the tailnet hostname (server
was **not** stopped or restarted):

```
STEP 1 — config.js default URL derivation (stubbed location.hostname)
  location.hostname = 'localhost'              -> ws://localhost:8080/ws
  location.hostname = 'bill.hippogryph-goldeye.ts.net' -> ws://bill.hippogryph-goldeye.ts.net:8080/ws
  PASS local default  (expect ws://localhost:8080/ws)
  PASS remote default (expect ws://bill.hippogryph-goldeye.ts.net:8080/ws)

STEP 2 — live handshake over the tailnet hostname (server on :8080)
  WS open (tailnet hostname)
  {t:'view'} received — entries=0 live={"generation":null,"tools":[]}
  PASS join -> view handshake over tailnet hostname
```

### Gate 4 — bundle sanity

- `web/config.js` (served verbatim by `web/scripts/serve.mjs` / nginx as a static file):
  contains the derived construction `ws://${location.hostname}:8080/ws`.
- `web/dist/app.js`: still contains `_normalizeWsUrl` (grep count 2); `DEFAULT_WS_URL`
  fallback (`shared/`, untouched) still present and composed from its constants.

## Manual fallback (?ws= override)

For any remote viewer whose default derivation is undesirable (or before this fix
deploys), append the override to the page URL:

```
http://bill.hippogryph-goldeye.ts.net:8081/?ws=ws://bill.hippogryph-goldeye.ts.net:8080/ws
```

The `?ws=` query param is checked first by `_connect()` and always wins over the
config.js default.

## Diff

- `web/config.js` — `window.STOA_WS_URL = "ws://localhost:8080/ws"` →
  `window.STOA_WS_URL = \`ws://${location.hostname}:8080/ws\``; comments updated to
  document the hostname-derivation and the unchanged override precedence.
