# Web Fonts — Geist Mono, Instrument Serif, Inter Tight — Handoff Report

**Branch:** `web-fonts` (off `origin/main` @ `fba8328` = merged PR #10; main already includes the user's `colors` commit and PR #8 logging)
**PR:** "feat(web): add Geist Mono, Instrument Serif, Inter Tight fonts"
**Date:** 2026-10-05
**Scope:** `web/` ONLY — `server/` and `shared/` untouched (no diffs outside `web/`).

Three SIL OFL-licensed families added to the Stoa web app: **Geist Mono** (mono),
**Instrument Serif** (branding/serif headings), **Inter Tight** (UI sans). All three
ship an `OFL.txt` kept verbatim in the worktree for license compliance.

## Font usage map (which family applied where)

| Family | Role | Where applied |
|---|---|---|
| **Inter Tight** | UI sans (body/default text) | `:root --font-sans`; `body { font-family: var(--font-sans) }` in `web/index.html`; `stoa-app` `:host` (inherits to header/transcript/composer/message tree) |
| **Instrument Serif** | Branding / serif headings | `stoa-header` `h2` ("Research Room" title); `stoa-contributions` `header h2` ("Contributions" page header) |
| **Geist Mono** | Monospace content | `stoa-message` `.msg.tool` (tool-call bubbles); `stoa-message` `.source-chip` (contribution chips); `stoa-transcript` `.tool-progress` (live tool-call progress lines) |

Note: there is no `requestId`/`request_id` anywhere in `web/src/` (grepped) — the only
pre-existing monospace surfaces were `.msg.tool` and `.tool-progress`, which now use
`var(--font-mono)`. `.source-chip` was not previously mono; it is now set to
`--font-mono` since the chips render contribution ids (code-like) — a font-family-only
change, no layout/design changes.

All component usages reference the `:root` tokens with a local fallback stack (e.g.
`var(--font-sans, -apple-system, …)`), so nothing breaks if the tokens are absent, and
the user's `colors`-commit color tokens in `:root` are untouched (font tokens were only
*added* below them).

## File layout (web/fonts/, one subdir per family, licenses kept)

```
web/fonts/
├── Geist_Mono/
│   ├── GeistMono-VariableFont_wght.ttf
│   ├── GeistMono-Italic-VariableFont_wght.ttf
│   └── OFL.txt                          # SIL OFL 1.1 (Geist Project Authors, 2024)
├── Instrument_Serif/
│   ├── InstrumentSerif-Regular.ttf      # static — no variable build in this family
│   ├── InstrumentSerif-Italic.ttf
│   └── OFL.txt                          # SIL OFL 1.1 (Instrument Serif Project Authors, 2022)
└── Inter_Tight/
    ├── InterTight-VariableFont_wght.ttf
    ├── InterTight-Italic-VariableFont_wght.ttf
    └── OFL.txt                          # SIL OFL 1.1 (Inter Project Authors, 2022)
```

Pruned: the 16 static `Geist_Mono/static/*.ttf` and 16 static `Inter_Tight/static/*.ttf`
files were dropped (variable fonts cover the weights; `font-weight: 100 900` range on the
`@font-face`). `README.txt` files from the zip were also dropped — only the listed fonts +
`OFL.txt` are committed per spec. `Instrument_Serif` has no variable build, so its two
statics are kept. Extracted with `python3 -m zipfile` (no `unzip` on host), pruned, and
copied into the worktree. Total ~1.7 MB.

## Wiring

### web/index.html
- Six `@font-face` blocks (variable `font-weight: 100 900` for Inter Tight + Geist Mono;
  static `400` for Instrument Serif), all `font-display: swap`, referenced by absolute
  `/fonts/...` URLs (same convention as `/config.js` and `/dist/app.js`).
- `:root` font tokens added (color tokens untouched):
  `--font-sans` (Inter Tight → system sans fallback), `--font-serif` (Instrument Serif →
  Georgia/…/serif), `--font-mono` (Geist Mono → ui-monospace/…/monospace).
- `body` now uses `font-family: var(--font-sans)`.

### web/scripts/serve.mjs (local dev)
- Added `".ttf": "font/ttf"` to the MIME map. The server already serves anything under
  `web/`, so `web/fonts/` is reachable at `/fonts/...` — verified with `curl -I`.

### web/Dockerfile (nginx image)
- Stage 2 now also `COPY web/fonts/ /usr/share/nginx/html/fonts/` (right after the
  config.js copy), so the fonts + their `OFL.txt` land under nginx's docroot.
- `web/nginx.conf` required **no change**: its only locations are `/dist/` and `/`, and the
  `/` `try_files $uri $uri/ /index.html` already serves static files under `/fonts/`.

## Gates (all green, verified on the committed tree)

| Gate | Result |
|---|---|
| `pnpm -C web run build` (esbuild → `web/dist/app.js`) | ✅ exit 0, `Built: …/web/dist/app.js` |
| server typecheck `pnpm run typecheck` (`tsc --noEmit`) | ✅ 0 errors, exit 0 |
| server build `pnpm run build` (`tsc`) | ✅ 0 errors, exit 0 |
| server `npm test` (smoke suite) | ✅ 12 passed, 0 failed |
| `docker compose config` | ✅ valid, exit 0 |

Server gates required `@stoa/shared` built first (its `dist/` is gitignored and not
committed): `pnpm -C shared run build` was run in the worktree — a build artifact only, no
tracked-file changes.

The compose gate: the worktree has no `server/.env` (gitignored, so absent from a fresh
git worktree). Per instructions the check was run against the worktree's **actual**
`docker-compose.yml` (the `env_file: server/.env` variant at `origin/main`, which differs
from the stale `environment:` variant still checked out at `~/stoa` HEAD `0f0a375`) by
temporarily copying the gitignored `server/.env` from `~/stoa`, running `docker compose
config` (exit 0), then removing the temp `.env` (it never entered the diff). Note: `~/stoa`
main checkout is behind `origin/main` and was not otherwise touched.

## Verification output

After `pnpm -C web run build`, with `node web/scripts/serve.mjs 8099`:

```
$ curl -sI http://127.0.0.1:8099/fonts/Geist_Mono/GeistMono-VariableFont_wght.ttf
HTTP/1.1 200 OK
Content-Type: font/ttf

$ curl -sI http://127.0.0.1:8099/fonts/Inter_Tight/InterTight-Italic-VariableFont_wght.ttf
HTTP/1.1 200 OK
Content-Type: font/ttf

$ curl -sI http://127.0.0.1:8099/fonts/Instrument_Serif/InstrumentSerif-Regular.ttf
HTTP/1.1 200 OK
Content-Type: font/ttf

$ curl -s http://127.0.0.1:8099/fonts/Geist_Mono/GeistMono-VariableFont_wght.ttf | wc -c
173204                       # matches the committed file size

$ curl -s http://127.0.0.1:8099/ | grep -c "@font-face"
6                            # all six @font-face blocks served

$ curl -s http://127.0.0.1:8099/ | grep -E -- "--font-sans|--font-serif|--font-mono"
    --font-sans: "Inter Tight", ...
    --font-serif: "Instrument Serif", ...;
    --font-mono: "Geist Mono", ...;
    font-family: var(--font-sans);
```

- (a) served `index.html` contains the `@font-face` blocks (6) and the new font tokens ✅
- (b) font files exist under `web/fonts/` in the worktree (tree above) ✅
- (c) dev server serves fonts with `Content-Type: font/ttf` ✅ — then killed cleanly.

Cleanup: the dev server was killed and its child node process on port 8099 terminated; no
stray processes from this session remain. (A pre-existing node listener on port 18099 —
not started by this session — was left untouched.)

## Hygiene

- No diffs outside `web/`.
- `:root` color tokens from the user's `colors` commit are unchanged (only font tokens added).
- No secrets in the diff (grep for key/token/secret/password clean); no conflict markers.
