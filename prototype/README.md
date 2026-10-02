# Stoa POC

A proof-of-concept shared room where several people can contribute material and
question it together through one shared AI agent. Built on **Pi Durable**
with Venice.ai as the model provider.

> **UX-first, NO neutrality.** No encryption, attestation, confidential compute,
> or multi-host portability. Single Venice provider, plain WebSocket, Docker.

## Layout

```
prototype/
├── README.md               # this file
├── REPORT.md               # full completion report
├── .env.example            # compose/root env placeholders
├── docker-compose.yml      # two services: server + web
├── shared/                 # SINGLE SOURCE OF TRUTH for the WS protocol
│   ├── protocol.js         # message types, factories, type guards (ESM, JSDoc)
│   └── protocol.d.ts       # TypeScript declarations (consumed by server/)
├── server/                 # backend — Pi Durable + WS bridge + Venice provider
│   ├── .env.example, package.json, tsconfig.json, Dockerfile
│   ├── src/server.ts       # Venice provider via createProvider (qwen-chat-template)
│   └── scripts/smoke.mjs
└── web/                    # frontend — plain SPA, configurable WS URL
    ├── index.html, config.js, nginx.conf, Dockerfile
    └── scripts/serve.mjs
```

## Quick Start (local)

```bash
# Backend (terminal 1)
cd prototype/server
npm install && npm run build
PORT=8080 npm start

# Frontend (terminal 2)
node prototype/web/scripts/serve.mjs
# → http://localhost:8081
```

With a model key:
```bash
VENICE_INFERENCE_KEY=your-key PORT=8080 npm start
```

Or drop a `server/.env` (see `server/.env.example`) next to `package.json` —
`npm start` loads it automatically via `node --env-file-if-exists=.env` (Node ≥22.9).
No key = server still boots; only model answers are unavailable.

## Docker

```bash
cd prototype
VENICE_INFERENCE_KEY=your-key docker compose up --build
```

- **Server:** `http://localhost:8080` (WS at `/ws`)
- **Web:** `http://localhost:8081` (SPA loads shared protocol from `/shared/protocol.js`)

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

## WS Protocol (shared/protocol.js)

Client→Server: `join`, `submit` (exactly-once), `steer`, `interrupt`, `fork`, `configure`, `ping`
Server→Client: `view`, `commit`, `answer_delta`, `tool`, `sources`, `error`

## Gating

```bash
cd prototype/server
npm run typecheck   # tsc --noEmit — zero errors
npm run build       # tsc emit — zero errors
npm run smoke       # boot + WS + view + transcript + ping + exit (no key)

cd prototype
docker compose config  # must pass
docker compose build   # both services
```

## License

MIT
