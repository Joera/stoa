# Stoa

A shared room where several people bring knowledge together and question it
with one shared AI agent. Built on **Pi Durable** with **Venice.ai** as the
model provider.

> **UX-first, NO neutrality.** No encryption, attestation, confidential
> compute, or multi-host portability. Single Venice provider, plain WebSocket,
> Docker.

This is a **pnpm monorepo** (flat, top-level workspace members, following the
`s2s`/`s3ntiment` convention): `shared/` is a buildable TypeScript workspace
package imported **by name** (`@stoa/shared`) from both `server/` and `web/` —
no relative `../shared` paths, no runtime HTTP serving of shared code.

## Layout

```text
~/stoa
├── pnpm-workspace.yaml        # workspace: shared, server, web (flat, top-level)
├── package.json               # @stoa/monorepo — shared-first build/dev/test scripts
├── docker-compose.yml         # two services: server (:8080) + web (:8081)
├── .env.example               # compose/root env placeholders (copy to .env for keys)
├── README.md                  # this file
├── REPORT.md                  # monorepo restructure report
├── shared/                    # @stoa/shared — SINGLE SOURCE OF TRUTH for the WS protocol
│   ├── package.json           # main/types/exports → dist/; build: tsc
│   ├── tsconfig.json          # NodeNext, declaration + declarationMap → dist/
│   └── src/
│       ├── index.ts           # barrel
│       └── protocol.ts        # message types, factories, type guards (TS)
├── server/                    # @stoa/server — backend: Pi Durable + WS bridge + Venice
│   ├── package.json, tsconfig.json, Dockerfile, .env.example
│   ├── src/server.ts          # Venice provider via createProvider (qwen-chat-template)
│   ├── src/bridge.ts          # WS ⟷ harness protocol bridge (imports @stoa/shared)
│   └── scripts/smoke.mjs      # smoke test (boot + WS + view + ping + exit, no key)
└── web/                       # @stoa/web — Lit web components SPA
    ├── index.html, config.js, nginx.conf, Dockerfile
    ├── src/                   # Lit components (stoa-app, -header, -rail, -transcript, ...)
    └── scripts/build.mjs      # esbuild bundle (aliases @stoa/shared → shared/src)
    └── scripts/serve.mjs      # tiny static server for local dev
```

## How shared is consumed

- **server/** — Node backend. Resolves the built package:
  `import type { ClientMessage, … } from "@stoa/shared"` (declared as
  `"@stoa/shared": "workspace:*"`). TypeScript/tsc resolve the workspace symlink
  → `shared/dist` (built first, see root `build`).
- **web/** — browser bundle. esbuild **aliases** `@stoa/shared` →
  `shared/src` and bundles the **raw TypeScript source** (s2s browser pattern),
  so no prebuilt JS is served over HTTP and there is no `/shared/` location in
  nginx, no shared-module external URL, and no hand-written `.d.ts`.

## Quick Start (local)

```bash
# One-time install (from repo root)
pnpm install

# Build shared first, then server + web
pnpm build            # shared → server → web (explicit shared-first order)

# Backend (terminal 1)
pnpm -C server run start      # node --env-file-if-exists=.env dist/server.js
# → http://localhost:8080  (WS at /ws)

# Frontend (terminal 2)
pnpm -C web run build
node web/scripts/serve.mjs
# → http://localhost:8081
```

With a model key:
```bash
VENICE_INFERENCE_KEY=your-key pnpm -C server run start
```

Or drop a `server/.env` (see `server/.env.example`) next to the server package —
`pnpm start` loads it automatically via `node --env-file-if-exists=.env`
(Node ≥22.9). No key = server still boots; only model answers are unavailable.

## Docker

```bash
docker compose up --build        # from repo root (context = repo root)
```

- **Server:** `http://localhost:8080` (WS at `/ws`)
- **Web:** `http://localhost:8081` (SPA; protocol module is **bundled** into
  `dist/app.js` — nothing is served from `/shared/`)

For a key, copy `.env.example` to `.env` in the repo root (compose reads it for
`${VENICE_INFERENCE_KEY:-}` substitution) or export it in your shell.

## Environment Variables (server)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP + WebSocket listen port |
| `STORAGE_PATH` | `./agent.sqlite` | SQLite database path |
| `VENICE_INFERENCE_KEY` | _(none)_ | Venice API key |
| `VENICE_BASE_URL` | `https://api.venice.ai/api/v1` | Venice API base URL |
| `MODEL` | `deepseek-v4-flash-0731` | Model ID (DeepSeek V4 Flash 0731 via Venice) |

## Provider: Venice

Uses `createProvider` from `@earendil-works/pi-ai`:
- API: `openai-completions`
- Base URL: `https://api.venice.ai/api/v1` (configurable)
- Auth: `VENICE_INFERENCE_KEY` env var
- Model: `deepseek-v4-flash-0731` (DeepSeek V4 Flash 0731 via Venice)
- Thinking: `qwen-chat-template` with `chatTemplateKwargs: { enable_thinking: true, preserve_thinking: false }`

## WS Protocol (shared/src/protocol.ts)

Client→Server: `join`, `submit` (exactly-once), `steer`, `interrupt`, `fork`, `configure`, `ping`
Server→Client: `view`, `commit`, `answer_delta`, `tool`, `sources`, `error`

No protocol definitions are duplicated anywhere. Changing the protocol means
changing `shared/src/protocol.ts`; `tsc --declaration` re-emits `dist/` types.

## Gating

```bash
pnpm -C shared run build            # tsc → dist/ (JS + .d.ts)
pnpm -C server run typecheck        # tsc --noEmit — zero errors
pnpm -C server run build            # tsc emit — zero errors
pnpm -C server run smoke            # boot + WS + view + transcript + ping + exit (no key)
pnpm -C web run build               # esbuild bundle
docker compose config               # must pass
docker compose up --build           # both services boot; WS handshake works
```

## Known deviations (POC)

- Commit ops use `replace /entries` when the entry set changes; pure live/tool
  ticks produce no commit op.
- Fork and configure return explicit "not yet implemented" errors.
- The `room` field in `join` is accepted but ignored (single-room POC).
- Custom conversation docs (room.contributions, room.source-ledger) are not in
  ConversationView.docs — bridged via `harness.snapshot()`.

## License

MIT
