# Stoa POC — Completion Report

**Branch:** `poc-scaffold`
**Commit:** _(see below)_
**Date:** 2026-10-02

## Files Created

```
prototype/
├── package.json              # deps + scripts
├── tsconfig.json             # TypeScript config (Node16 ESM)
├── .dockerignore
├── Dockerfile                # node:22-alpine, VOLUME /data, EXPOSE 8080
├── docker-compose.yml        # port 8080, named volume, PROVIDER_KEY passthrough
├── README.md                 # how to run, env vars, milestone-1 demo, layout
├── scripts/
│   └── smoke.mjs             # 15-pass smoke test
├── public/
│   └── index.html            # SPA: room view, composer, interrupt, source chips, contribution rail
└── src/
    ├── config.ts             # env: PORT, STORAGE_PATH, PROVIDER_KEY, MODEL
    ├── room-extension.ts      # 'room' extension: ContributionsDoc, SourceLedgerDoc, list_contributions tool, source attribution hook
    ├��─ bridge.ts             # WS ⟷ harness protocol bridge (join, submit, steer, interrupt, fork, configure, ping)
    └── server.ts             # boots Harness over SQLite, installs extension, resume(), serves static, WS /ws
```

## WS Protocol (as implemented)

Client → server:
- `{t:"join", room}` — Attach to root conversation, receive view snapshot + subscribe to deltas
- `{t:"submit", content, requestId, whenBusy?}` — Exactly-once submit via Pi Durable
- `{t:"steer", content}` — Submit with `whenBusy:"steer"`
- `{t:"interrupt"}` — `conversation.abort()`
- `{t:"fork", atAnswerId, content?}` — Not yet implemented (out of scope for M1); returns error
- `{t:"configure", tools?}` — Not yet implemented; returns error
- `{t:"ping"}` — Keepalive (no response)

Server → client:
- `{t:"view", snapshot}` — Full state (entries, live, inbox, agent, usage) on join
- `{t:"commit", ops}` — Incremental entry changes (derived from viewState diffs)
- `{t:"answer_delta", text}` — Streaming partial answer text from pi.live
- `{t:"tool", id, name, output}` — Tool progress from pi.live.tools
- `{t:"sources", refs}` — Which contributions an answer drew on (from room.source-ledger doc)
- `{t:"error", message}` — Rejection / failure

**Deviations from spec:** None. Fork and configure return explicit "not yet implemented" errors rather than silently ignoring. Commit ops use `replace /entries` instead of fine-grained per-entry ops — sufficient for the POC.

## Gate Results

```
npm install      → clean (0 vulnerabilities)
npm run typecheck → tsc --noEmit: zero errors
npm run build     → tsc: zero errors  
Server boot      → boots, serves index.html, opens /ws (verified with curl)
npm run smoke    → 15 passed, 0 failed
```

### Smoke Test Details
```
  ✓ Server boots and logs ready message
  ✓ Server logs no-model-key warning
  ✓ GET / returns 200
  ✓ Response contains <title>Stoa
  ✓ WebSocket connects to /ws
  ✓ Receives {t:'view'} snapshot after join
  ✓ Snapshot has entries array
  ✓ Snapshot has live field
  ✓ Snapshot has inbox field
  ✓ Snapshot has agent field
  ✓ Snapshot has usage field
  ✓ No protocol errors received
  ✓ Received commit or delta events after submit
  ✓ Ping does not crash connection
  ✓ Server exits cleanly
```

No PROVIDER_KEY was set — model answers absent (expected). The smoke verifies boot, WS handshake, view snapshot, protocol event flow, and clean shutdown.

## How to Run the Demo

```bash
cd prototype
npm install && npm run build

# Without model key (server boots, UI loads, model calls fail gracefully):
PORT=8080 npm start
# Open http://localhost:8080

# With model key (full answer streaming):
PROVIDER_KEY=sk-... PORT=8080 npm start
# Open http://localhost:8080 in two tabs
```

## PR URL

_(to be filled after `gh pr create`)_
