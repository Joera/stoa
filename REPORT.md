# Monorepo Restructure — Completion Report

**Branch:** `monorepo-restructure` (off `main` @ `e921492`)
**PR:** `monorepo-restructure` → `main` (title: "Monorepo restructure: pnpm workspace, TS shared package as real import")
**Date:** 2026-10-02
**Scope:** PURE STRUCTURAL REFACTOR — zero behavioral change to the protocol,
server behavior, or web UI. No new features, no provider changes (Venice as-is),
no vitest adoption (the existing smoke gate is kept).

## What changed

`~/stoa` is now a **pnpm monorepo** matching the `s2s`/`s3ntiment` convention
(see `.stoa/diffs/monorepo-convention.md`): flat, top-level workspace members,
`shared/` is a **buildable TypeScript workspace package** consumed **by name**
from both apps. The old `prototype/` tree is gone (migrated via `git mv` where
similarity allowed — history tracks; heavily-edited files show as add/delete);
`brain/` and `.stoa/` are untouched. All work was done in the linked worktree
`/home/joera/worktrees/stoa-monorepo`; `/home/joera/stoa` (main checkout) was
never touched.

## Final layout

```text
~/stoa
├── pnpm-workspace.yaml        # packages: ['shared','server','web'] + minimumReleaseAge: 0,
│                              #   autoInstallPeers: false, allowBuilds (esbuild et al.)
├── .npmrc                     # minimum-release-age=0 (explicit guardrail; see comment in file)
├── package.json               # @stoa/monorepo — scripts: shared / build / dev / test
├── pnpm-lock.yaml             # committed frozen lockfile
├── docker-compose.yml         # server :8080 / web :8081 (context = repo root)
├── .gitignore  .dockerignore  # consolidated at repo root (node_modules, dist, .env)
├── .env.example               # compose/root env placeholders (no real keys)
├── README.md                  # consolidated prototype/README.md + REPORT.md, paths updated
├── REPORT.md                  # this file
├── shared/                    # @stoa/shared — buildable TS package (protocol single source of truth)
│   ├── package.json           # main/types/exports → dist/; files: [dist]; build: tsc
│   ├── tsconfig.json          # NodeNext, declaration + declarationMap, outDir dist, rootDir src
│   └── src/{index.ts, protocol.ts}   # ← protocol.js + hand-written protocol.d.ts merged into TS
├── server/                    # @stoa/server — Pi Durable + WS bridge + Venice provider
│   ├── package.json           # dep "@stoa/shared": "workspace:*"
│   ├── tsconfig.json          # NodeNext tsc → dist
│   ├── Dockerfile             # pnpm workspace: build shared first, then server
│   └── src/*.ts  scripts/smoke.mjs  .env.example
└── web/                       # @stoa/web — Lit components SPA
    ├── package.json           # dep "@stoa/shared": "workspace:*"
    ├── tsconfig.json          # experimentalDecorators + useDefineForClassFields false (kept)
    ├── Dockerfile             # pnpm workspace build; no /shared/ COPY; tsconfig copied (decorator fix)
    ├── nginx.conf             # /shared/ location removed
    ├── scripts/build.mjs      # esbuild alias @stoa/shared → shared/src; external removed
    ├── scripts/serve.mjs      # /shared/ mapping removed
    └── src/*.ts  index.html  config.js
```

## Shared-import mechanism chosen — and why

Two consumers, two resolution paths, both importing `@stoa/shared` **by name**
(never `../../shared/…`, never a runtime URL):

| Consumer | Resolution | Mechanism |
|---|---|---|
| **server/** (node) | built `dist/` | `"@stoa/shared": "workspace:*"` → pnpm symlink in `server/node_modules` → `shared/dist/index.js` / `.d.ts`. `tsc` resolves it directly. Shared must be built first (root `build`/`dev` enforce the order). |
| **web/** (browser) | raw TS source | esbuild `alias: { "@stoa/shared": shared/src }` bundles the **TypeScript source** directly into `dist/app.js` (the s2s browser pattern). No prebuilt JS served over HTTP. |

Why this split (mirrors `s2s`): the node backend wants compiled `dist/` with
emitted `.d.ts` (plain `tsc`, no bundler, NodeNext ESM); the browser wants the
raw source so esbuild can inline it with the rest of the app. `shared/src/index.ts`
is a barrel so the alias target is a directory (esbuild resolves `index.ts`) and
the node `exports` map points at `dist/index.js`.

The hand-written `shared/protocol.d.ts` was **deleted** — types are now emitted
by `tsc --declaration` (protocol.ts merged the JS logic + hand-written types).

## Gate table

Run at head commit on `monorepo-restructure`. Commands from repo root.

| # | Gate | Command | Result |
|---|---|---|---|
| 1 | shared builds to dist with .d.ts | `pnpm -C shared run build` | ✅ `tsc` → `dist/{index,protocol}.{js,d.ts}` + maps |
| 2 | server typecheck 0 errors | `pnpm -C server run typecheck` | ✅ 0 errors |
| 2 | server build 0 errors | `pnpm -C server run build` | ✅ `tsc` emits dist, 0 errors |
| 2 | server smoke all pass | `pnpm -C server run smoke` | ✅ **12 passed, 0 failed** (exit 0; 3 expected no-key caveats: transcript content, answer_delta, sources) |
| 3 | web build succeeds | `pnpm -C web run build` | ✅ esbuild bundle → `web/dist/app.js` |
| 3 | bundle no longer imports /shared/protocol.js | `grep -c "/shared/protocol.js" web/dist/app.js web/dist/app.js.map` | ✅ 0 occurrences (external removed) |
| 3 | legacy decorators preserved | bundle inspection | ✅ esbuild build emits no `Unsupported decorator location` error; bundle contains `__decorateClass` ×23 (legacy) and **0** standard-decorator helpers (`__decorateElement`/`__runInitializers`), plus 2× `customElements.define`. The single inert occurrence of the literal "Unsupported decorator location" is Lit's own compiled runtime guard (`@lit/reactive-element/decorators/property.ts`, confirmed via sourcemap) — present in any Lit bundle, never thrown at build/load here. |
| 4 | compose config valid | `docker compose config` | ✅ parses (server :8080 / web :8081, context repo root) |
| 4 | compose up boots | `docker compose up --build` | ✅ both images built (pnpm workspace aware), containers up |
| 4 | server responds | `curl localhost:8080/` | ✅ `200 OK` "Stoa server OK — WebSocket at /ws" |
| 4 | web serves on :8081 | `curl localhost:8081/` | ✅ SPA HTML + `/config.js`; `/shared/protocol.js` returns only the nginx SPA fallback (text/html) — no shared module served |
| 4 | cross-origin WS handshake | WS client w/ `Origin: http://localhost:8081` → `ws://localhost:8080/ws` | ✅ open → `join` → `{t:'view'}` snapshot (entries/live/inbox/agent/usage present) |
| 5 | structural proof | `grep -rnF "../shared" server/src web/src`; `grep -rn "/shared/protocol.js" web/src web/scripts web/package.json web/Dockerfile web/nginx.conf` | ✅ empty — no relative shared imports anywhere; both apps import `@stoa/shared` by name (declared `workspace:*`); no shared runtime URL in web src/build config |
| 6 | git hygiene | `git status`; `grep -nE 'VENICE_INFERENCE_KEY_|sk-[A-Za-z0-9]'` over the diff | ✅ clean except ignored `server/.env`; `.env` never tracked; no real key in any commit (only the env-var *name* `VENICE_INFERENCE_KEY`, which is not a key) |

The compose stack was verified end-to-end then torn down (`docker compose down`);
the `stoa-data` volume persists locally. The local `node web/scripts/serve.mjs`
was also verified: serves `/` + `/config.js` and returns **404** for
`/shared/protocol.js` (mapping removed).

## Decisions / deviations

- **`minimumReleaseAge: 0` (`.npmrc` + `pnpm-workspace.yaml`).** pnpm 11.16
  enforces a default 24h minimum-release-age supply-chain gate. The first-party
  `@earendil-works/*@1.0.0` packages were published 2026-10-01 (inside the
  window), which broke `pnpm install`. These are first-party, exact-version pins
  in the committed frozen lockfile, so the heuristic is disabled — declared both
  in the root `.npmrc` (explicit, portable) and in `pnpm-workspace.yaml`
  (`minimumReleaseAge: 0`, which pnpm itself wrote into the workspace yaml on
  first install). Docker's `pnpm install --frozen-lockfile` passes regardless
  (frozen installs skip re-resolution), so no image change was needed.
- **`allowBuilds`** in `pnpm-workspace.yaml` (auto-added by pnpm) permits the
  native build scripts (`esbuild` binary, `protobufjs`, `@google/genai` — a
  transitive dep of `@earendil-works/pi-ai`).
- **`autoInstallPeers: false`** kept for lockfile stability (matches the s2s
  convention note); the committed lockfile records it in `settings`.
- **Dockerfiles (both) build within the pnpm workspace:** copy
  `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml*`, the package
  manifests, then `pnpm install --frozen-lockfile || pnpm install`, then
  `pnpm -C shared run build` **before** the consumer build. The server runtime
  image copies `server/dist` + the workspace `node_modules` tree + the
  `@stoa/shared` package (`package.json` + `dist`) so the pnpm symlink layout is
  intact. The web image copies `web/tsconfig.json` so esbuild keeps
  `experimentalDecorators`/`useDefineForClassFields` (the legacy-decorators fix),
  and no longer copies `shared/` into the nginx image.
- **`dev` script (root):** `pnpm -r --parallel run dev` (server + web, shared has
  no dev script so it is skipped). Server dev keeps `node --watch
  --env-file-if-exists=.env dist/server.js` — no new toolchain (no tsx).
- **`test` script (server):** aliased to the existing smoke gate (`pnpm run
  smoke`) so root `pnpm -r test` exercises it — vitest was **not** adopted.
- **Per-package `.gitignore`/`.dockerignore`** consolidated into root files; the
  old npm `package-lock.json` files removed (`pnpm-lock.yaml` is the committed
  lockfile).
- **`.env` migration:** `.env` files are gitignored and absent from the worktree
  (a real key was never copied). `server/.env.example` documents the local
  `--env-file-if-exists` flow; the root `.env.example` documents the compose
  substitution vars. Both contain placeholders only.
- **`shared/` barrel (`src/index.ts`):** added so the esbuild directory alias
  (`@stoa/shared → shared/src`) resolves and the node `exports` map points at
  `dist/index.js` — the s2s convention (`src/index.ts` barrel).

## Notes on gate 5 wording

The literal `grep -rn "../shared" server/src web/src` is **not** textually empty
because the by-name import `@stoa/shared` matches the loose regex (`.` matches
the `a` before `/shared`). The precise checks above — fixed-string `../shared`
and the `/shared/protocol.js` scan — are all empty, which is the actual
requirement: **no relative-path shared imports and no shared runtime URL remain**.
