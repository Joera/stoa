# Web client WS URL missing /ws path — Fix Report

**Branch:** `fix-ws-url` (off `main` @ `b469419`)
**PR:** `fix-ws-url` → `main` (title: "fix: web client WS URL missing /ws path")
**Date:** 2026-10-02
**Scope:** SMALL, TIGHTLY-SCOPED BUG FIX — zero other behavior change. No server
code touched, no protocol change, no new features, no vitest adoption (the
existing smoke gate is kept).

## Root cause

The server's WebSocket upgrade handler (`server/src/server.ts`) accepts upgrades
**only** on pathname `/ws`; any other path calls `socket.destroy()`.

The web client, however, connected with a URL that had **no `/ws` path**:
`web/config.js` set `window.STOA_WS_URL = "ws://localhost:8080"` (no suffix), and
`web/src/stoa-app.ts` `_connect()` did `new WebSocket(WS_URL)` with that URL
directly. `DEFAULT_WS_URL` (`shared/src/protocol.ts`) is correct
(`ws://localhost:8080/ws`), but it was shadowed by the config.js default.

Result: the browser connected to `ws://localhost:8080/` (path `/`), the server
destroyed the socket, and the UI logged
`WebSocket connection to 'ws://localhost:8080/' failed` and retried forever.

## Chosen fix + why

Normalize the resolved URL in **one place**, `_connect()`, so both the
`config.js` default and any `?ws=` override behave identically
(`web/src/stoa-app.ts`):

```ts
private _normalizeWsUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.pathname === "" || u.pathname === "/") {
      u.pathname = "/ws";
    }
    return u.toString();
  } catch {
    return url; // not absolute — WebSocket() resolves it as before (no behavior change)
  }
}
```

- Applied to `params.get("ws") || window.STOA_WS_URL || DEFAULT_WS_URL` — one
  code path covers the default config **and** the override.
- If the pathname is already `/ws` (or any explicit path), it is left untouched
  — the path is **never appended twice** (no `//ws`, no `/ws/ws`).
- `web/config.js` default updated to `ws://localhost:8080/ws` to make the
  endpoint explicit and self-documenting; consistent with the normalization
  (an explicit `/ws` is left alone), so no double path can occur.
- `try/catch` guards the `new URL()` parse so unparseable/relative overrides
  fall through to the pre-fix behavior — zero behavior change for non-absolute
  inputs.

Why here rather than in the server: the server contract (`/ws` only) is the
designated public endpoint and is correct as-is; the bug is purely on the
client side, so the fix stays client-side and touches no protocol.

## Acceptance gates

| # | Gate | Command | Result |
|---|------|---------|--------|
| 1 | Web bundle builds | `pnpm -C web run build` | ✅ `Built: .../web/dist/app.js` |
| 2a | Server typecheck | `pnpm -C server run typecheck` | ✅ 0 errors (exit 0) |
| 2b | Server smoke (server untouched) | `pnpm -C server run smoke` | ✅ **12 passed, 0 failed** |
| 3 | Functional proof (both URL forms) | node ws client → worktree server on :8080 | ✅ see below |
| 4 | Bundle sanity | grep of `web/dist/app.js` | ✅ `_normalizeWsUrl` + `DEFAULT_WS_URL` with `/ws` in bundle; no bare un-normalized URL |
| 5 | Repo hygiene | `git status` / `git diff` | ✅ only `web/config.js` + `web/src/stoa-app.ts`; no stray files, no API keys |

### Gate 3 — functional proof

Started the worktree server (`pnpm -C server run start` from
`/home/joera/worktrees/stoa-ws-fix/server`, port 8080), then ran a node `ws`
client (`/tmp/stoa-ws-proof.mjs`) that mirrors the fixed `_normalizeWsUrl`
verbatim:

```
[1] RAW  ws://localhost:8080  (no path, no normalization) -> REJECTED by server (path "/" -> socket.destroy) ✓ bug reproduced
[2] FIXED ws://localhost:8080/ws  (config.js default, normalized) -> join -> {t:'view'} OK (entries=0)
[3] FIXED ws://localhost:8080/ws  (explicit /ws, unchanged)      -> join -> {t:'view'} OK (entries=0)

PASS: both ws://localhost:8080 (bare) and ws://localhost:8080/ws reach /ws and complete the handshake.
```

Server log confirmed both normalized connections: two `WS client connected`
events (the raw bare one is destroyed before `connection` and never logged).

Note: the pre-existing dev server on :8080 (main checkout, same untouched server
code) was briefly stopped to run this gate and then restarted; the main checkout
was never modified.

## Diff

- `web/src/stoa-app.ts` — `_connect()` routes the resolved WS URL through
  `_normalizeWsUrl()`; new `_normalizeWsUrl()` helper (append `/ws` only when
  pathname is `""`/`"/"`; never double-append; try/catch fallback).
- `web/config.js` — default `ws://localhost:8080` → `ws://localhost:8080/ws`;
  comment documents the `/ws` contract and normalization.
