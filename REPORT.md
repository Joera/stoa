# Mobile Nav Routing with Contributions Page — Handoff/Finish Report

**Branch:** `mobile-nav` (off `main` @ `f8d4e86`)
**PR:** https://github.com/Joera/stoa/pull/10 — "feat(web): mobile nav routing with contributions page"
**Date:** 2026-10-05
**Scope:** `web/` ONLY — `server/` and `shared/` untouched (verified: no diffs outside `web/`, `pnpm-lock.yaml`).

This session took over an existing worktree whose implementation edits were intact but whose
verification probe had wedged the previous session (the probe opened a LIVE WebSocket to a local
server and never exited). No code was reverted or rewritten from the in-progress approach; the
edits were inspected, kept as-is, and taken to a green, reviewed, PR'd state with a terminating probe.

## Contract compliance

1. **navigo hash routing** — `<stoa-app>` owns `new Navigo("/", { hash: true })` (navigo v8 spelling
   of v7's `useHash`). Routes: `/` and `/contributions`; only `_route` is updated, rendering is a
   plain conditional below the router.
2. **`/#/` = room view, single-column, no rail** — `web/src/stoa-rail.ts` deleted; header +
   transcript + composer render directly (column flex host). No `<stoa-rail>` anywhere.
3. **`/#/contributions` = separate contributions page** — new `web/src/stoa-contributions.ts` with
   the same static contribution cards that used to live in the rail, plus a Back-to-Room link that
   dispatches `stoa-back` → `router.navigate("/")`.
4. **Single WS + single app state that survives route changes** — the WebSocket, `_entries`,
   `_liveGeneration`, `_liveTools` all live on `<stoa-app>` and are never torn down by routing;
   `connectedCallback` calls `_connect()` exactly once. Route flips (button clicks and browser
   back/forward) only re-render, so no second socket opens and no state is lost.
5. **web/ only** — no `server/` or `shared/` source changes.

## Commits

- `616775e` `chore(web): add navigo@8 hash router dependency` (web/package.json, pnpm-lock.yaml)
- `a9adc8c` `feat(web): mobile nav routing with contributions page` (stoa-app/header/composer,
  +stoa-contributions, −stoa-rail)

## Gates (all green, verified on the committed tree)

| Gate | Result |
|---|---|
| `pnpm -C web run build` (esbuild → `web/dist/app.js`) | ✅ exit 0, `Built: …/web/dist/app.js` |
| server typecheck `pnpm -C server run typecheck` (`tsc --noEmit`) | ✅ 0 errors, exit 0 |
| server build `pnpm -C server run build` (`tsc`) | ✅ 0 errors, exit 0 |
| `cd server && npm test` (smoke) | ✅ **12 passed, 0 failed** |
| `docker compose config` | ✅ valid |
| secrets grep over the diff (`api_key|secret|password|token|bearer|sk-…`) | ✅ none |

`web/dist/` is gitignored (build artifact — gate only, not committed), matching repo convention.

## Verification proof (the critical part) — TERMINATES

**Why the previous session wedged:** its probe opened a LIVE WebSocket to a local server and the
node script never exited, so the bash step never returned. This probe avoids that entirely and is
structurally guaranteed to terminate:

- **No live WebSocket.** `window.WebSocket` is replaced by a counting stub
  (`class FakeWebSocket { constructor(){ instances.push(this); } }`). No socket is ever opened, no
  server is contacted, and the app's `onclose → setTimeout(reconnect, 2000)` path can never fire
  because `onclose` is never invoked.
- **Explicit `process.exit(0)`** at the end kills every lingering timer (`setInterval` interrupt
  poll, navigo's 1ms hash freeze timer) and any socket.
- **Measured runtime ~1s per probe; exit code 0; `ps` confirms no stray node processes.**

### Probe 1 — `probe.mjs` (23/23 PASS)
jsdom (`url: http://localhost/`, `pretendToBeVisual`, custom-element capable) + the stub above.
Mounts `<stoa-app>`, then drives the real user flow (real `button.click()` through shadow roots):
- (a) `/` renders room view: `_route === "/"`, **no `<stoa-rail>`** in app, `<stoa-header>`,
  `<stoa-transcript>`, `<stoa-composer>` present; exactly **1** WebSocket after mount.
- injects a `{t:"view"}` snapshot over the stubbed socket → `_entries.length === 2`; calls
  `ws.onopen()` → join sent once.
- (b) click header **Contributions** button → `_route === "/contributions"`,
  `<stoa-contributions>` rendered, room view unmounted, `location.hash === "#/contributions"`,
  still **1** WebSocket, entries still 2.
- (c) click **Back to Room** → `_route === "/"`, room view restored, `hash === "#/"`, still **1**
  WebSocket, entries still 2. Then navigate away again and `history.back()` (popstate) → room view
  restored, still **1** WebSocket, entries still 2.
- `WebSocket constructor invocations: 1` across the entire run.

### Probe 2 — `probe-deeplink.mjs` (4/4 PASS)
Fresh jsdom at `url: http://localhost/#/contributions` (direct deep link): `_route ===
"/contributions"` on first render, `<stoa-contributions>` rendered, no room view, **1** WebSocket.

Both scripts end with `process.exit(0)`; both returned exit 0 in ~1 second (verified with
`timeout 30`, never hung) and left no background processes.

Probe scripts live at `/tmp/stoa-probe/{probe,probe-deeplink}.mjs` (kept outside the worktree so the
repo stays clean).
