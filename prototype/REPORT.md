# Stoa POC — Completion Report

**Branch:** `poc-scaffold`
**Commits:**
- `3752218e70fa8d1015d9c8bfd42c23d3a19a1f50` — initial scaffold
- `ed3bd0d` — fix B1–B4 review blockers + nits
- _(latest)_ — backend/frontend split + shared protocol

**PR:** https://github.com/Joera/stoa/pull/1
**Date:** 2026-10-02

## Layout (post-split)

```
prototype/
├── README.md                 # how to run locally + Docker, protocol table, env vars
├── REPORT.md                 # this file
├── docker-compose.yml        # two services: server + web
├── shared/                   # SINGLE SOURCE OF TRUTH for WS protocol
│   ├── protocol.js           # message types, factories, type guards (ESM, JSDoc)
│   └── protocol.d.ts         # TypeScript declarations (consumed by server/)
├── server/                   # backend package
│   ├── package.json, tsconfig.json, .dockerignore, Dockerfile
│   ├── src/server.ts         # boots Harness over SQLite, installs extension, resume(), WS /ws on PORT
│   ├── src/bridge.ts         # WS ⟷ harness protocol bridge (imports shared/)
│   ├── src/room-extension.ts  # 'room' extension: docs, tool, attribution hook
│   ├── src/config.ts         # env config
│   └── scripts/smoke.mjs     # 13-pass smoke test
└── web/                      # frontend package
    ├── index.html            # SPA consuming shared/protocol.js as ESM, configurable WS URL
    ├── config.js             # window.STOA_WS_URL = 'ws://localhost:8080'
    ├── nginx.conf            # serves static + /shared/ alias
    └── Dockerfile            # nginx:alpine
```

## Shared/ — the protocol single source of truth

`shared/protocol.js` defines every message type, factory function, and type guard
for the WS protocol. It is consumed by:

- **server/** — bridge.ts imports protocol types via `protocol.d.ts` (TypeScript
  resolves it alongside `protocol.js` at compile time)
- **web/** — index.html loads it at runtime via `<script type="module" src="/shared/protocol.js">`;
  nginx serves `shared/` under `/shared/`

No protocol definitions are duplicated anywhere. Changing the protocol means
changing `shared/protocol.js` and the parallel `shared/protocol.d.ts`.

## WS Protocol (as implemented)

**No shape changes from the previous version** — same message types, relocated to shared/.

### Deviations from spec
- Commit ops use `replace /entries` when entry set changes; pure live/tool ticks produce no commit op
- Fork and configure return explicit "not yet implemented" errors
- The `room` field in `join` is accepted but ignored (single-room POC)
- Custom conversation docs (room.contributions, room.source-ledger) are not in ConversationView.docs — bridged via harness.snapshot()

## Gate Results

### Server (post-split)
| Gate | Result |
|---|---|
| `npm install` | clean (0 vulnerabilities) |
| `npm run typecheck` | **zero errors** |
| `npm run build` | **zero errors** |
| `npm run smoke` | **13 passed, 0 failed** |

### Docker Compose
| Gate | Result |
|---|---|
| `docker compose config` | valid ✓ |
| `docker compose build` (server) | built ✓ |
| `docker compose build` (web) | built ✓ |
| `docker compose up` | boots both ✓ |
| `curl localhost:8081/` | SPA HTML served ✓ |
| `curl localhost:8081/shared/protocol.js` | shared module served ✓ |
| `curl localhost:8081/config.js` | WS URL config served ✓ |
| `curl localhost:8080/` | server health check ✓ |
| WS handshake to `ws://localhost:8080/ws` | join→view snapshot ✓ |
| `docker compose down` | clean teardown ✓ |

### Smoke Test Details
```
  ✓ Server boots and logs ready message
  ✓ Server logs no-model-key warning
  ✓ WebSocket connects to /ws
  ✓ Receives {t:'view'} snapshot after join
  ✓ Snapshot has entries array
  ✓ Snapshot has live field
  ✓ Snapshot has inbox field
  ✓ Snapshot has agent field
  ✓ Snapshot has usage field
  ✓ No protocol errors received
  ✓ Submitted message content appears in transcript (not '(empty)')
  ✓ Ping does not crash connection
  ✓ Server exits cleanly after SIGTERM

  Caveats (expected without VENICE_INFERENCE_KEY):
  - No answer_delta events (streaming wired to generation.message.content)
  - No sources events (pipeline wired: seed → match → commit → emit)
```

## How to Run

```bash
# Local (two processes)
cd prototype/server && npm install && npm run build
PORT=8080 npm start                              # terminal 1
cd prototype/web && npx serve . -p 3000          # terminal 2 (or open index.html directly)

# Docker (one command)
cd prototype
VENICE_INFERENCE_KEY=your-key docker compose up --build
# Server: http://localhost:8080, Web: http://localhost:8081
```

## Fixes from Review (B1–B4 + Nits)

### B1: Transcript content extraction
EntryRecord has no `content` field. Text is in `model[0].content`. Fixed.

### B2: answer_delta derivation
pi.live.generation.message.content (not nonexistent .text). Fixed.

### B3: Tool event keying
ToolSlot uses `callId`, not `id`. Fixed.

### B4: Source attribution pipeline
Custom docs not in ConversationView.docs; hook never committed. Fixed: seeds on join, bridge matches + commits + emits.

### Nits
Incremental commit ops, honest self-reporting, proper exit verification, ESM-safe cleanup, WS input validation.

## Backend/Frontend Split

Protocol definitions extracted from bridge.ts and index.html into `shared/protocol.js` (+ `.d.ts`). Server backend no longer serves static frontend — pure WS backend. Web frontend is a separate nginx container with configurable WS URL. Both consume the same shared module via their respective mechanisms (TypeScript imports for server, ESM `<script>` import for web).
