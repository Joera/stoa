# Stoa POC

A proof-of-concept shared room where several people can contribute material and
question it together through one shared AI agent. Built on **Pi Durable**.

> **UX-first, NO neutrality.** No encryption, attestation, confidential compute,
> or multi-host portability. One shared model provider, plain WebSocket, one
> Docker container.

## Quick Start

```bash
# Install
npm install

# Build TypeScript
npm run build

# Run (no model key = server boots but model calls will fail)
PORT=8080 STORAGE_PATH=./agent.sqlite npm start

# With a real model:
PROVIDER_KEY=sk-... npm start
```

Open `http://localhost:8080` in two browser tabs. Ask a question in one; the
answer streams live in both.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP + WebSocket listen port |
| `STORAGE_PATH` | `./agent.sqlite` | SQLite database path |
| `PROVIDER_KEY` | _(none)_ | OpenAI API key |
| `MODEL` | `gpt-5-mini` | Model ID to use |

## Docker

```bash
# Build and run with Docker Compose
PROVIDER_KEY=sk-... docker compose up --build

# Or with plain docker:
docker build -t stoa-poc .
docker run -p 8080:8080 -v stoa-data:/data -e PROVIDER_KEY=sk-... stoa-poc
```

## Milestone 1 Demo

1. Start the server (with or without a model key).
2. Open `http://localhost:8080` in **two browser tabs**.
3. In one tab, type a question and press Enter.
4. Both tabs see the shared transcript update live.
5. A late-joining tab receives the full snapshot, then incremental deltas.
6. If running with a model key, answers stream in real time with source
   attribution chips under each answer.

## Project Layout

```
prototype/
├── src/               # TypeScript backend
│   ├── server.ts      # Boots harness, serves static, opens /ws
│   ├── bridge.ts      # WS ⟷ harness protocol bridge
│   ├── room-extension.ts  # Contributions doc, source ledger, attribution hooks
│   └── config.ts      # Env config
├── public/            # Plain HTML/CSS/JS SPA (no build step)
│   └── index.html
├── scripts/
│   └── smoke.mjs      # Smoke test (boot + WS + protocol)
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## WS Protocol

Client → server: `join`, `submit`, `steer`, `interrupt`, `fork`, `configure`, `ping`
Server → client: `view`, `commit`, `answer_delta`, `tool`, `sources`, `error`

See `prototype.md` in the `brain/` docs for the full spec.

## Gating

```bash
npm run typecheck   # tsc --noEmit — zero errors
npm run build       # tsc emit — zero errors
npm run smoke       # boot server + WS handshake + view + protocol flow
```

## License

MIT
