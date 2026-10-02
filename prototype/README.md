# Stoa POC

A proof-of-concept shared room where several people can contribute material and
question it together through one shared AI agent. Built on **Pi Durable**.

> **UX-first, NO neutrality.** No encryption, attestation, confidential compute,
> or multi-host portability. One shared model provider, plain WebSocket, one
> Docker container.

## Layout

```
prototype/
├── README.md               # this file
├── REPORT.md               # full completion report
├── docker-compose.yml      # two services: server + web
├── shared/                 # SINGLE SOURCE OF TRUTH for the WS protocol
│   ├── protocol.js         # message types, factories, type guards (ESM, JSDoc)
│   └── protocol.d.ts       # TypeScript declarations (consumed by server/)
├── server/                 # backend — Pi Durable + WS bridge
│   ├── package.json, tsconfig.json
│   ├── Dockerfile
│   ├── src/                # server.ts, bridge.ts, room-extension.ts, config.ts
│   └── scripts/smoke.mjs
└── web/                    # frontend — plain HTML/CSS/JS SPA
    ├── index.html          # room view, composer, interrupt, source chips
    ├── config.js           # window.STOA_WS_URL = 'ws://localhost:8080'
    ├── nginx.conf          # serves static + shared/ module
    └── Dockerfile          # nginx:alpine
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
PROVIDER_KEY=sk-... PORT=8080 npm start
```

Open two browser tabs at the web frontend. Ask a question; the answer streams live in both.

**WS URL configuration (frontend):** edit `web/config.js` to change the default,
or pass `?ws=wss://myhost:8080` in the URL.

## Docker

```bash
cd prototype
PROVIDER_KEY=sk-... docker compose up --build
```

- **Server:** `http://localhost:8080` (WS at `/ws`)
- **Web:** `http://localhost:8081` (SPA loads shared protocol from `/shared/protocol.js`)

## Environment Variables (server)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP + WebSocket listen port |
| `STORAGE_PATH` | `./agent.sqlite` | SQLite database path |
| `PROVIDER_KEY` | _(none)_ | OpenAI API key |
| `MODEL` | `gpt-5-mini` | Model ID to use |

## WS Protocol

Defined once in `shared/protocol.js` — consumed by both `server/` and `web/`.

### Client → Server

| Message | Meaning |
|---|---|
| `{t:"join", room}` | Attach to room |
| `{t:"submit", content, requestId, whenBusy?}` | Submit input (exactly-once) |
| `{t:"steer", content}` | Redirect running turn |
| `{t:"interrupt"}` | Abort current work |
| `{t:"fork", atAnswerId, content?}` | Open side conversation (not yet implemented) |
| `{t:"configure", tools?}` | Rule/tool toggle (not yet implemented) |
| `{t:"ping"}` | Keepalive |

### Server → Client

| Message | Meaning |
|---|---|
| `{t:"view", snapshot}` | Full state on join |
| `{t:"commit", ops}` | Incremental entry changes |
| `{t:"answer_delta", text}` | Streaming partial answer |
| `{t:"tool", id, name, output}` | Tool progress |
| `{t:"sources", refs}` | Which contributions an answer drew on |
| `{t:"error", message}` | Rejection / failure |

## Gating

```bash
cd prototype/server
npm run typecheck   # tsc --noEmit — zero errors
npm run build       # tsc emit — zero errors
npm run smoke       # boot + WS + view + transcript + ping + exit (no key needed)

cd prototype
docker compose config  # must pass
docker compose build   # both services
```

## License

MIT
