# Prototype: Stoa POC (UX-first)

A small, throwaway proof-of-concept to validate the **experience** of a Stoa: a
room where several people contribute material and question it together through
one shared AI agent. The POC deliberately **ignores neutrality**. No encryption
at rest, no confidential compute, no attestation, no private inference, no
multi-host portability, no ownership puzzles. One shared model provider, plain
network transport, one Docker container on one server.

This spec covers the architecture, the Docker layout, and — in most detail —
**how the frontend and the backend talk to each other**, which is the piece
with real unknowns.

Grounding: `idea.md` (the concept), `pi-1-0-synthesis.md` (why Pi 1.0 / Pi
Durable fits), and the Earendil "Pi Durable" post (2026-10-01) for the engine's
actual primitives.

## Goal

Validate the UX questions the full idea depends on, using Pi Durable as the
engine and a real multi-tab browser demo:

- Does a shared answer **streaming live** to everyone in the room feel right?
- Can a **late joiner** pick up the thread without missing context?
- Can anyone **steer** the agent mid-answer (redirect, interrupt, follow-up)?
- Do **side conversations as forks** feel natural next to the main room?
- Is **source attribution** (an answer says which contributions it drew on)
  legible at a glance?
- Do **contribution rules** (who may query, quote-only, combinable, expiry)
  feel real when enforced in code rather than by asking the model to behave?
  — kept minimal here: no crypto, just the tool/hook enforcement.

## Out of scope (deliberately)

Neutrality (encryption, confidential compute, attestation, private/local
inference, portability), governance, revocation-vs-history semantics,
combination-leak detection, bad-contribution quarantine, the name question.

## Architecture

```
┌─────────────────────────── Browser (the frontend) ──────────────────────────┐
│   Room view: streaming answers, contribution list, forks, source chips      │
│   One tab per person; N tabs join the same room                             │
└───────────────▲───────────────────────────────────────────────▲─────────────┘
                │ WebSocket (fallback: SSE + POST)              │  network hop
                ▼                                                │
┌────────────── Docker container on a server (the backend) ─────┴─────────────┐
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Stoa server — one Node process                                        │ │
│  │                                                                        │ │
│  │  • Pi Durable harness (Harness.open over SQLite)                       │ │
│  │  • room → conversation mapping, thread → fork mapping                  │ │
│  │  • contribution-rule extension (tools + hooks)                         │ │
│  │  • WebSocket/HTTP bridge: subscribe to viewState / watch(),            │ │
│  │    accept submits                                                      │ │
│  │  • serves the built frontend (static)                                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────┐                            │
│  │  agent.sqlite (mounted volume, survives    │  in-process hop            │
│  │  container redeploys)                      │                            │
│  └────────────────────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

Two hops, not one:

1. **Browser ↔ Stoa server** (network): the protocol in the next section.
2. **Stoa server ↔ Pi Durable harness** (in-process, same process in the POC):
   `viewState()` + `view.subscribe()` / `watch()` for pushing commits out, and
   `submit()` for steering the agent. No second network hop in the POC — the
   harness process IS the server process. (Later, a separate harness process
   could be attached the same way `watch()` ops fit over a socket.)

### Room model on Pi Durable

- **Room = root conversation.** The room's main transcript is the shared thread.
  Created on first use, identical after every restart (`harness.root()`).
- **Side conversation = fork.** A reply to an answer forks the room conversation
  at that answer (`conversation.fork(answer)`), ownerless, exactly like the
  Slack-channel-and-thread example in the Pi Durable post.
- **Room state = documents.** The contribution list, each contribution's rules,
  and the source ledger live in typed docs (`defineDoc`, conversation scope),
  committed atomically with the transcript, and UI-subscribable via
  `documentState().subscribe()`.
- **Rules = an extension.** One extension ("room") supplies the tools and hooks
  that enforce contribution rules on every retrieval — quote-only reads,
  combinability gates, expiry checks. Enforced in code, never by prompting.
- **Agent = shared.** One model provider for the whole room in the POC.
  Per-conversation agent config means a fork can use a cheaper model.

## Communication between frontend and backend

### Transport

**Decision: WebSocket, one persistent connection per tab.**

WebSocket is the POC's transport because it gives the best performance for the
streaming-live UX in a deliberately simple architecture — one Node process, a
small set of watchers, no hostile proxies or CDNs in front of the container.

- Pi Durable's `watch()` "delivers the exact operations of every commit, small
  enough to send over a socket" — a socket is the natural home for it.
- Bidirectional in one connection: server pushes commits, client submits and
  steers on the same socket. Low latency is what the "streaming live" UX
  depends on, and one connection trivially serializes steer-vs-stream ordering.
- The simple architecture means WebSocket's usual costs don't bite:
  hand-rolled reconnect is covered by our snapshot-then-deltas plus exactly-once
  `requestId` safety net, and there is no proxy/LB in front to configure.

SSE + POST stays the documented fallback if a deployment later turns
proxy-hostile to WebSockets. The message protocol below is transport-agnostic,
so swapping transports is a config-level change, not a rewrite. The POC ships
WebSocket only.

Both transports ride the same logical message protocol, below.

### Protocol (WebSocket JSON messages)

Client → server:

| Message | Meaning | Maps to |
|---|---|---|
| `{t:"join", room}` | Attach to a room | `harness.root(room)` + `viewState()` |
| `{t:"submit", content, requestId, whenBusy}` | Ask a question / follow-up / steer | `conversation.submit({type:"input", content, requestId, whenBusy})` |
| `{t:"fork", atAnswerId, content?}` | Open a side conversation from an answer | `conversation.fork(answer)` + optional first submit |
| `{t:"steer", content}` | Redirect a running turn | `submit(..., whenBusy:"steer")` |
| `{t:"interrupt"}` | Abort current work | abort conversation (Esc semantics) |
| `{t:"configure", tools?}` | Toggle a contribution's rule/tool for this conversation | `conversation.configure({tools:{add/remove}})` |
| `{t:"ping"}` | Keepalive / liveness | — |

Server → client:

| Message | Meaning | Maps to |
|---|---|---|
| `{t:"view", snapshot}` | Full current state on join/reconnect: transcript, answer being streamed, running tools + output, queued messages, agent, usage | `viewState()` value |
| `{t:"commit", ops}` | Incremental changes after the snapshot; only what changed | `view.subscribe()` / `watch()` forwarded |
| `{t:"answer_delta", text}` | Streaming partial answer (can be derived from commits; separate only if we want finer-grained streaming than the commit stream) | model stream |
| `{t:"tool", id, name, output}` | Tool progress/streaming output for the room to watch | tool `api.output()` |
| `{t:"sources", refs}` | Which contributions this answer drew on | source ledger doc read at answer commit |
| `{t:"error", message}` | Rejection / failure | hook block, throw, transport error |

Key behaviors to preserve:

- **Exactly-once submits.** Every submit carries a `requestId`; a re-sent submit
  after a reconnect returns the original submission instead of double-asking
  (Pi Durable's exactly-once guarantee).
- **Join-late / reconnect.** A new tab opens with a `{t:"view"}` snapshot
  (transcript, streaming answer, running tools, queued messages, usage), then
  only deltas. This is the whole "join late without losing the thread" UX.
- **Steering mid-answer.** A `{t:"steer"}` queued behind the current tool calls
  becomes part of the running turn; `{t:"interrupt"}` aborts current work.
- **Crash recovery.** Every step is a checkpointed task; on container restart
  the server calls `harness.resume()`, clients reconnect, and the same
  submissions complete from their last checkpoint. The POC can demo this by
  `docker restart`ing mid-answer and watching the room pick up.

### How the server bridges to the harness (in-process)

- On boot: `Harness.open(SQLite)`, install the "room" extension, `resume()`.
- For each connected client: `conversation.viewState()` → send `{t:"view"}`
  immediately, then forward `view.subscribe()` callbacks as `{t:"commit"}`.
  (For higher fidelity ops, forward `conversation.watch()` instead.)
- On `{t:"submit"}`: `conversation.submit(...)` with the client's `requestId`.
- On `{t:"fork"}`: `conversation.fork(answer, {ownership:{kind:"ownerless"}})`.
- Tool streaming: the room extension's tools call `api.output()`; the server
  forwards those to the room as `{t:"tool"}`.
- Source attribution: a `beforeTool`/`afterResponse` hook records which
  contributions were read into the answer's commit; the server reads the
  source ledger doc and emits `{t:"sources"}` with the answer.

## Docker layout (conceptual)

One container, one process, one volume:

- **Image:** `node:22-alpine` (or whatever current LTS Pi Durable needs).
- **Contents:** built frontend (static), the Stoa server bundle,
  `package.json` deps (`@earendil-works/pi-durable`, `@earendil-works/pi-ai`,
  `@earendil-works/chord`).
- **Volume:** `/data` holding `agent.sqlite` — survives redeploys; this is
  what makes the room "durable" across container restarts.
- **Ports:** one exposed port for the WebSocket + static serving (e.g. 8080).
- **Env:** model provider key, room id, compaction settings
  (`reserveTokens`/`backgroundTokens` so long rooms keep streaming without
  stalling to summarize).

```
docker build -t stoa-poc .
docker run -p 8080:8080 -v stoa-data:/data -e PROVIDER_KEY=... stoa-poc
```

## UX surface (what the POC shows)

- **Room view** — one scrolling transcript everyone sees update live.
- **Composer** — ask a question; visible to all; enter while the agent works =
  steer, queued behind current tools.
- **Live answer** — the shared answer streams in front of everyone; interrupt
  button (Esc) aborts current work.
- **Contribution rail** — the room's contributions with their rules (who may
  query / quote-only / combinable / expiry); add a contribution and watch a new
  tool appear.
- **Source chips** — each answer shows which contributions it drew on.
- **Forked thread** — a reply opens a side conversation; both run concurrently,
  visible as threads in the room; late joiners see them as forks of the history.

## POC milestones

1. **Single room, one agent** — Docker up, one tab, ask a question, answer
   streams in. Proves the container + harness + frontend loop.
2. **Multiplayer viewing** — two tabs in the room; both see the same stream
   live; a tab that joins late gets the full view then deltas. Proves
   `viewState`/`watch` bridging and the join-late UX.
3. **Steering, forks, sources, rules** — steer mid-answer, interrupt, fork a
   thread, per-answer source chips, and one real contribution rule enforced by
   a tool/hook. Proves the room-shaped UX on Pi Durable.
4. **Crash drill** — `docker restart` mid-answer; room resumes from checkpoint;
   clients reconnect and catch up. Proves durability UX.

## Risks / unknowns

- **Pi Durable is experimental** — API may change; the POC pins a version and
  treats the API surface as a moving target.
- **watch() op fidelity vs. viewState deltas** — raw commit ops may be too
  low-level for a room UI; the server may need to translate commits into
  room-shaped events (answers, tools, sources) rather than forward raw ops.
- **WebSocket reconnect + exactly-once** — needs the `requestId` round-trip to
  be airtight or a reconnected client double-submits.
- **Streaming granularity** — whether the commit stream is fine-grained enough
  for smooth character-level answer streaming, or the server needs the raw
  model stream for deltas.
- **One process owns storage** — fine for one container; a second server
  process attaching to the same SQLite would need the remote-attach pattern
  (out of scope for the POC).
- **Model provider choice** — the POC's agent feel (and cost) depends on it;
  pin one provider for the room.

## Sources

- `idea.md` — the concept; `pi-1-0-synthesis.md` — why Pi 1.0 / Pi Durable.
- Earendil, "Pi Durable", 2026-10-01 (earendil.com/posts/pi-durable/): harness
  model, storage backends, `viewState`/`watch`, exactly-once `requestId`,
  forks, documents, compaction, extensions/hooks, crash recovery.

## Implementation status (2026-10-02)

**Built and merged in two stages (2026-10-02).**

**Stage 1 — scaffold: PR #1 (MERGED).** `poc-scaffold` implemented the scaffold
exactly per this spec's architecture and WS protocol under `prototype/`.
Review cycle: independent review -> **BLOCKING** (four bugs at the Pi Durable
1.0.0 API boundary) -> fix commit `ed3bd0d` -> re-review **APPROVE-WITH-NITS**.
The human merged PR #1 at `ed3bd0d` (merge `5a4bfda`); `main` now carries the
scaffold + B1–B4 fixes.

**Stage 2 — split: PR #2 (OPEN, `poc-split`).** User-requested split of backend
and frontend plus a shared protocol module to prevent drift:

- `prototype/server/` — backend package only (Pi Durable harness over SQLite,
  room extension, WS bridge on :8080, **no static serving**), own Dockerfile.
- `prototype/web/` — SPA served by its own **nginx container** (port 80 →
  published 8081), configurable WS URL (`web/config.js` → `window.STOA_WS_URL`,
  default `ws://localhost:8080`, `?ws=` override) — no same-origin assumption.
- `prototype/shared/` — **single source of truth** for the WS protocol:
  `protocol.js` (ESM factories + type guards) consumed by web at runtime,
  `protocol.d.ts` consumed by server at compile time. Zero duplicated
  definitions; message shapes unchanged from PR #1.
- `docker-compose.yml` — two services (`server` :8080, `web` :8081) + shared
  `stoa-data` volume.

Split review: **APPROVE-WITH-NITS**, all 7 contract items empirically
confirmed by the reviewer against a scratch build (gates 13/13; compose
build/up; curl of web `/`, `/shared/protocol.js`, `/config.js`; server health
NOT SPA; WS join→view + submit round-trip through published ports; protocol
shape extracted programmatically and unchanged; single-source grep clean). Nit
fixes landed in `915262f` (local quick-start `node prototype/web/scripts/serve.mjs`
verified 200 for all three paths, root `.dockerignore`, `configure` pre-join
guard restored). PR #1 was merged at the pre-split state, so the split commits
were rebased onto merged `main` as `poc-split` (cherry-pick clean; PR #2 diff
is byte-identical to the reviewed delta; gates re-verified at `a5db7e5`).

Where the built protocol differs from this spec (documented honestly in the
PRs' REPORT.md):

- `fork` and `configure` return explicit "not yet implemented" errors (M1
  scope).
- `commit` ops are full `replace` of `/entries` only when the entry-id set
  changes; live/tool ticks emit no commit op — incremental in effect, not
  per-field JSON Patch.
- `join`'s `room` field is accepted and ignored — one root conversation.
- Custom conversation docs (`room.source-ledger`) are **not** in
  `ConversationView.docs` (only the four built-ins are mounted); the source
  pipeline works around that: the bridge seeds contributions and commits
  matched sources to `SourceLedgerDoc` itself, then emits `{t:'sources'}`.

Verified by the orchestrator at fix commit `ed3bd0d` (pre-split): `npm run
typecheck` 0 errors, `npm run build` 0 errors, `npm run smoke` 15/15 (boot, WS
handshake, view snapshot, submit -> transcript content round-trip, ping, real
SIGTERM exit check). Post-split (`fe89c83`/`915262f`, re-verified at rebased
`a5db7e5`): smoke 13/13 (the two static-serving assertions were correctly
dropped), typecheck/build 0, `docker compose config` valid. Docker images build
and boot; nginx serves the SPA + shared module; server answers the join->view
handshake and content round-trip through the published port. **B2
(`answer_delta` streaming) and B3 (live tool round) are wired against the
published `pi-durable@1.0.0` types but NOT end-to-end tested — they require
`PROVIDER_KEY`** (no live generation without an upstream provider). B1
(transcript content) and B4 (source pipeline: seed -> match -> commit -> emit,
incl. late-joiner re-emit) were empirically verified by the reviewer against a
scratch-built server. The milestone-1 demo therefore needs a model key in the
container.

Residual non-blocking nits (full review in `.stoa/diffs/scaffold-poc-review/REPORT.md`):
SPA streaming-bubble / interrupt lifecycle not cleared on commit;
`answer_delta` is a prefix-length diff (can stall-then-jump on regeneration);
tool diff is index-aligned (fragile to call reordering); `emitSourcesIfNew` is
fire-and-forget from the subscribe callback; matching logic duplicated between
`bridge.ts` and the extension hook memo. Worth a follow-up before the demo.

Review caveat: the requested cross-family reviewer model (`kimi-k2-7-code`)
silently fell back to the harness default (`deepseek-v4-flash-0731`), so the
review shares the implementer's model family — it compensated by empirically
probing the built server rather than trusting code reading.

Next: human merges PR #2 (`poc-split`); then `worktrees/stoa-poc-scaffold` can
be archived and the rebased `worktrees/stoa-poc-split` worktree kept for
follow-ups. Follow-ups from the milestone list — steer/fork/sources UI polish,
one real contribution rule enforced by tool/hook, crash drill (`docker restart`
mid-answer + reconnect catch-up).
