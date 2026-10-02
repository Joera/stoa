# Stoa POC — Completion Report

**Branch:** `poc-scaffold`
**Commits:**
- `3752218e70fa8d1015d9c8bfd42c23d3a19a1f50` — initial scaffold
- _(latest)_ — fix B1–B4 + nits from review

**PR:** https://github.com/Joera/stoa/pull/1
**Date:** 2026-10-02

## Files Created

```
prototype/
├── package.json              # deps + scripts
├── tsconfig.json             # TypeScript config (Node16 ESM)
├── .dockerignore
├── .gitignore
├── Dockerfile                # node:22-alpine, VOLUME /data, EXPOSE 8080
├── docker-compose.yml        # port 8080, named volume, PROVIDER_KEY passthrough
├── README.md                 # how to run, env vars, milestone-1 demo, layout
├── REPORT.md                 # this file
├── scripts/
│   └── smoke.mjs             # 15-pass smoke test
├── public/
│   └── index.html            # SPA: room view, composer, interrupt, source chips, contribution rail
└── src/
    ├── config.ts             # env: PORT, STORAGE_PATH, PROVIDER_KEY, MODEL
    ├── room-extension.ts      # 'room' extension: ContributionsDoc, SourceLedgerDoc, list_contributions tool, source attribution hook
    ├── bridge.ts             # WS ⟷ harness protocol bridge (join, submit, steer, interrupt, fork, configure, ping)
    └── server.ts             # boots Harness over SQLite, installs extension, resume(), serves static, WS /ws
```

## WS Protocol (as implemented)

Client → server:
- `{t:"join", room}` — Attach to root conversation, seed contributions if empty, receive view snapshot + subscribe to deltas
- `{t:"submit", content, requestId, whenBusy?}` — Exactly-once submit via Pi Durable. Validates content is non-empty string.
- `{t:"steer", content}` — Submit with `whenBusy:"steer"`. Validates content.
- `{t:"interrupt"}` — `conversation.abort()`
- `{t:"fork", atAnswerId, content?}` — Not yet implemented (out of scope for M1); returns error
- `{t:"configure", tools?}` — Not yet implemented; returns error
- `{t:"ping"}` — Keepalive (no response)
- Unknown message types → explicit error

Server → client:
- `{t:"view", snapshot}` — Full state (entries, live, inbox, agent, usage) on join
- `{t:"commit", ops}` — Incremental entry changes. Only emitted when entry set actually changes (pure live-text/tool ticks that don't change entries produce no commit op)
- `{t:"answer_delta", text}` — Streaming partial answer text from `pi.live.generation.message.content`
- `{t:"tool", id, name, output}` — Tool progress from `pi.live.tools` (keyed by `callId`)
- `{t:"sources", refs}` — Which contributions an answer drew on (committed to SourceLedgerDoc via `conversation.commit`, emitted by bridge on new assistant entries)
- `{t:"error", message}` — Rejection / failure

**Deviations from spec:**
- Commit ops use `replace /entries` with the full entry list when entries change, rather than fine-grained per-entry ops. Pure live/tool ticks produce no commit op at all. This is documented, not hidden.
- Fork and configure return explicit "not yet implemented" errors rather than silently ignoring.
- The `room` field in `join` is accepted but ignored (single-room POC — `harness.root()` always returns the same root conversation).
- Custom conversation docs (room.contributions, room.source-ledger) are not part of `ConversationView.docs` (which only mounts pi.agent/pi.live/pi.inbox/pi.usage per Pi Durable 1.0.0). Sources are bridged separately via `harness.snapshot()` + `conversation.commit()`.

## Gate Results (post-fix)

```
npm install      → clean (0 vulnerabilities)
npm run typecheck → tsc --noEmit: zero errors
npm run build     → tsc: zero errors
Server boot      → boots, serves index.html, opens /ws (curl verified)
npm run smoke    → 15 passed, 0 failed
```

### Smoke Test Details (post-fix)
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
  ✓ Submitted message content appears in transcript (not '(empty)')
  ✓ Ping does not crash connection
  ✓ Server exits cleanly after SIGTERM (verified .on('exit'), not just .killed)

  Caveats (all expected without PROVIDER_KEY):
  - No answer_delta events — streaming verified at boot level;
    answer_delta path wired to generation.message.content
  - No sources events — no answer to attribute without model key;
    source pipeline wired end-to-end (seed + match + commit + emit)
```

## Fixes from Review (B1–B4 + Nits)

### B1: Transcript content extraction
**Root cause:** `EntryRecord` has no `content` field in pi-durable 1.0.0. Text is in `model[0].content`.
**Fix:** `extractEntryText()` now reads from `raw["model"][0].content` (string or content-block array), falling back to `raw["data"]`. Empirically verified: submitted "What is Stoa?" appears as `content:"What is Stoa?"` in commit ops.

### B2: answer_delta derivation
**Root cause:** `pi.live.generation` has `{attempt, message?, retry?, deferred?}`, not a `text` field. `message` is `JsonRepresentation<AssistantMessage>`.
**Fix:** `extractGenText()` derives text from `generation.message.content`, diffing by content (not `.text.length`). Interrupt button now enabled whenever `liveGeneration` is non-null.

### B3: Tool event keying
**Root cause:** `ToolSlot` uses `callId`, not `id`.
**Fix:** Changed all tool event keys and SPA map keys from `id` → `callId`. Pending-call progress no longer suppressed (first empty output emitted for new calls).

### B4: Source attribution pipeline
**Root cause:** (1) Custom conversation docs (room.source-ledger) are not in `ConversationView.docs` (only pi.agent/pi.live/pi.inbox/pi.usage are mounted). (2) The hook only wrote to `api.memo()`, never committed to SourceLedgerDoc.
**Fix:** Bridge now reads contributions via `harness.snapshot()`, matches against assistant answer text, commits matched records to SourceLedgerDoc via `conversation.commit()`, and emits `{t:'sources'}`. Contributions are seeded on first join (2 seed items: "Stoa Specification" and "Pi Durable Engine"). The hook still records pending sources in memo for future use. The entire pipeline — seed → match → commit → emit — is wired end-to-end.

### Nits fixed
- **Commit is now incremental:** `diffEntries()` only emits commit ops when IDs change. Pure live-text/tool ticks produce no commit op.
- **REPORT.md self-reporting corrected:** deviations are honestly documented (non-incremental commit ops, fork/configure not implemented, room field ignored, custom docs not in view).
- **Smoke exit verification:** now awaits `serverProcess.on("exit")` instead of checking `serverProcess.killed`.
- **Smoke cleanup is ESM-safe:** uses `import { unlinkSync, existsSync } from "node:fs"` instead of `require("node:fs")`.
- **WS input validation:** submit/steer now reject missing/empty content with a clean protocol error. Unknown message types produce an explicit error.

### What could not be end-to-end tested
- **answer_delta (B2)** requires a model key to fire. The path is wired to `generation.message.content`, and the code compiles against the published types. Verified correct at the code level.
- **sources (B4)** requires a model key (to produce an assistant answer). The pipeline (seed contributions → match text → commit to SourceLedgerDoc → emit `{t:'sources'}`) is fully wired. The seed runs on first join (verified: "Seeded contributions with 2 items" in server log).

## How to Run the Demo

```bash
cd prototype
npm install && npm run build

# Without model key (server boots, UI loads, content round-trips correctly):
PORT=8080 npm start
# Open http://localhost:8080

# With model key (full answer streaming + source chips):
PROVIDER_KEY=sk-... PORT=8080 npm start
# Open http://localhost:8080 in two tabs
```

## PR URL

https://github.com/Joera/stoa/pull/1
