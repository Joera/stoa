# Mobile Menu + Minimal Header + Warm Theme — Handoff Report

**Branch:** `mobile-menu` (off `origin/main` @ `7f7dc8d`; main already includes PR #10 mobile nav routing + PR #11 fonts)
**PR:** "feat(web): mobile menu, minimal header, warm theme"
**Date:** 2026-10-05
**Scope:** `web/` ONLY — `server/` and `shared/` untouched (zero diffs outside `web/`).

Mobile-fit redesign of the Stoa room view: the interrupt button is gone, the
header is a minimal (large serif title + green dot + hamburger), a menu screen
opens from the hamburger, and the whole app switches to a light warm theme.

---

## Task 1 — Ditch the interrupt button

**`web/src/stoa-composer.ts`** — composer is now just input + Send:
- Removed `#interrupt-btn` from the render, its `#interrupt-btn` / `#interrupt-btn:disabled` CSS, the `interruptEnabled` + `interrupting` properties, and `_onInterrupt()`.
- Input keeps `flex: 1` (Send is fixed via `flex-shrink: 0`) and its 16px font-size (prevents iOS auto-zoom).

**`web/src/stoa-app.ts`**:
- Removed the `?interrupt-enabled` binding and `@stoa-interrupt` listener on `<stoa-composer>`.
- Removed `_onInterrupt()` and the now-unused `makeInterrupt` import (protocol still exports it — that's shared/, out of scope).
- Removed `_interruptCheckInterval` entirely: the field, the 500ms `setInterval(() => requestUpdate())` in `connectedCallback`, and its `clearInterval` in `disconnectedCallback`. **This kills a 500ms requestUpdate poll — a real mobile battery win.**

## Task 2 — Light warm theme (`web/index.html` `:root` tokens)

| Token | Before | After |
|---|---|---|
| `--bg` | `#fff` | `#fafaf7` |
| `--surface` | `#eee` | `#f2f2ec` |
| `--surface2` | `#ddd` | `#e8e8e0` |
| `--dim` | `#8892a4` | `#8a8a80` |
| `--border` | `#2a2a4a` (dark navy) | `#ddddd5` |
| `--text` | `#111` | `#111` (unchanged) |
| `--accent` | `#e94560` | `#e94560` (unchanged) |
| `--accent2` | `#533483` | `#533483` (unchanged) |
| `--green` | `#00b894` | `#00b894` (unchanged — reads fine on `#fafaf7` for a status dot) |
| `--user-bubble` | `#fff` | `#fff` (unchanged) |
| `--assistant-bubble` | `#fff` | `#fff` (unchanged) |

- The dark navy `#2a2a4a` is **gone from the tokens** (grep-confirmed zero occurrences in `web/`).
- `@font-face` blocks and `--font-sans/--font-serif/--font-mono` untouched — fonts are exactly as PR #11 shipped them.
- For coherence, the *fallback* colors baked into component CSS (dead code — tokens are always defined at `:root`) were updated from dark navy to the warm values in `stoa-composer`, `stoa-header`, `stoa-contributions`, `stoa-transcript`, `stoa-message`, so no navy remains anywhere in `web/src/`.

## Task 3 — Header redesign (`web/src/stoa-header.ts`)

- `h2`: **32px**, `text-transform: lowercase`, `font-weight: 500`, keeps `font-family: var(--font-serif)`.
- Connection status is now a **9px green dot** (`var(--green)` when connected; `#c0c0b8` dim gray when disconnected), with `aria-label`/`title` "Connected"/"Disconnected". The text status pill is gone.
- The 'Contributions' nav-link button is replaced by a **hamburger** (☰, 40×40 tap target, `aria-label="Open menu"`) at the far right, dispatching `stoa-menu-open` (bubbles, composed). `stoa-nav-contributions` is fully removed.
- The `h2` uses `flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` so on very narrow screens it ellipsizes (never wraps below ~28px, never pushes a second row); the dot + hamburger never shrink.

## Task 4 — Menu screen (new `web/src/stoa-menu.ts`)

A self-contained `<stoa-menu>` drawer component, rendered by `<stoa-app>` only while open:

- **State**: `@state() private _menuOpen = false` in `stoa-app.ts`. Header's `stoa-menu-open` toggles it; the menu is conditionally rendered on top of everything (`position: fixed; inset: 0; z-index: 1000`).
- **Layout**: dimmed full-screen backdrop + right-slide drawer (`width: min(320px, 85vw)`), using theme tokens (`background: var(--bg, #fafaf7)`, `border-left: 1px solid var(--border, #ddddd5)`).
- **Contents**: room title "Research Room" (serif, 28px lowercase), nav rows **Room** (`/`) and **Contributions** (`/contributions`) — each ≥48px touch target — and the connection state (green dot + "Connected"/"Disconnected" label).
- **Close paths** (all verified): tapping a nav row → dispatches `stoa-menu-navigate {detail:{route}}` → app navigates + closes; tapping the backdrop → `stoa-menu-close`; pressing **Escape** (window keydown listener added while mounted) → `stoa-menu-close`; the hamburger toggle in the app is `_menuOpen = !_menuOpen` (while open, the overlay covers the button, so that tap lands on the backdrop and closes — equivalent).
- The contributions page keeps its own `← Back to Room` back-link; no menu there (out of scope).

## Task 5 — Mobile fit (320px sanity)

- **Header @320px**: fixed = padding 32px + actions (dot 9 + gap 12 + hamburger 40 = 61) + host gap 12 = 105px → `h2` gets ~215px. 32px Instrument Serif lowercase "research room" ≈ 195px → fits; the flex + ellipsis guard handles any overflow without wrapping or going below 28px.
- **Composer @320px**: padding 40px + Send (~76px) + gap 8px → input ~196px with `flex: 1; min-width: 0`. Fits.

---

## Gates (all pass)

| Gate | Result |
|---|---|
| `pnpm -C web run build` (esbuild → `web/dist/app.js`) | ✅ exit 0 |
| `cd server && pnpm run typecheck` | ✅ exit 0 (0 errors) |
| `cd server && pnpm run build` | ✅ exit 0 |
| `cd server && pnpm test` | ✅ **12 passed, 0 failed** |
| `docker compose config` | ✅ exit 0 (run read-only from `/home/joera/stoa` main checkout — worktree compose == main's; no `.env` created in the worktree) |
| No secrets / no conflict markers / no stray processes | ✅ |

Note: server gates required building `@stoa/shared` first (its `dist/` is gitignored, so nothing new is committed).

## Verification (proof)

**Serve + curl** (`node web/scripts/serve.mjs 8099`, then killed — no stray process):
- (a) `/` (index.html): contains `#fafaf7` (1×), `#ddddd5` (1×), **no** `#2a2a4a` (0).
- (b) `/dist/app.js`: contains `stoa-menu-open` (2×), `Research Room` (3×), `menu-btn` (3×); **no** `interrupt-btn` (0), **no** `Interrupt` (0), no `#2a2a4a` (0).

**jsdom DOM check** (`/tmp/stoa-domtest/verify-menu.mjs`, jsdom installed in isolation so no repo dependency changes; stubbed WebSocket → no live WS; `process.exit(0)`):
```
14/14 DOM checks passed  (exit 0)
PASS  stoa-app mounted + room header rendered
PASS  header title is 'Research Room'
PASS  hamburger button present  — Open menu
PASS  status dot present in header
PASS  no interrupt button in composer
PASS  composer is just input + Send
PASS  menu drawer absent initially
PASS  menu drawer opens on hamburger tap
PASS  menu has Room + Contributions nav rows  — Room, Contributions
PASS  menu shows connection state  — (stub WS never opens → 'Disconnected')
PASS  menu connection dot present + dim when disconnected
PASS  menu closes on backdrop tap
PASS  menu closes after nav-item tap
PASS  menu closes on Escape
```
The check mounts `<stoa-app>` from the built bundle and asserts hamburger + dot + no interrupt button + menu open/close behaviors. jsdom was deliberately kept out of the repo's dependency tree (would have added ~50 transitive deps to the lockfile); the script is trivially rerunnable from `/tmp`.

## File change list

| File | Change |
|---|---|
| `web/index.html` | warm `:root` tokens (font blocks untouched) |
| `web/src/stoa-app.ts` | drop interrupt wiring + poll, add `_menuOpen` state + menu handlers/render |
| `web/src/stoa-composer.ts` | input + Send only |
| `web/src/stoa-header.ts` | big serif lowercase title, green dot, hamburger |
| `web/src/stoa-menu.ts` | **new** — menu drawer component |
| `web/src/stoa-contributions.ts` | warm fallback colors only (back-link kept) |
| `web/src/stoa-transcript.ts` | warm fallback color only |
| `web/src/stoa-message.ts` | warm fallback colors only |
