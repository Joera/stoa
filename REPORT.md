# Server request/response logging + Docker run path — Report

**Branch:** `add-server-logs-docker2` (off `main` @ `6dc94aa`)
**PR:** `add-server-logs-docker2` → `main` (title: "feat: server request/response logging + docker run path for diagnosing empty replies")
**Date:** 2026-10-02
**Scope:** INSTRUMENTATION + CONTAINERIZATION ONLY. Zero model/provider behavior
change, zero root-cause fix. No `web/` UI change beyond keeping compose working.

---

## What this PR does

1. **Server-side request/response logging** in `server/src/*.ts` only
   (`log.ts` new, `bridge.ts`, `server.ts`, `room-extension.ts` edited). Every line
   is tagged with an ISO timestamp and a per-turn correlation id (`corr=...`) plus
   a per-connection id (`conn=...`). Output is `console.log`/`console.error`, so it
   appears in `docker compose logs -f server`.
2. **Docker run path** — the app now runs as containers via `docker compose up
   --build` (server :8080, web :8081). The Venice key is injected at runtime via
   `env_file: server/.env` — never baked into the image, never committed
   (`server/.env` is gitignored + dockerignored).

## The instrumentation seam (honest boundary)

The harness's provider call is built and executed **inside `@earendil-works/pi-ai`
/ `pi-durable`**, which is out of scope to read or instrument. So the request and
result logs are taken at the **coarsest stoa-side seams**:

- **Request** (`[req]`): the stoa-visible conversation entries (`ConversationView.entries`)
  that the harness serializes into the provider request, logged **just before**
  `conversation.submit()` is called. Role + content length only, plus an
  `EMPTY CONTENT DETECTED` flag on any empty/whitespace message.
- **Result** (`[res]` + `[res-hook]`): the assistant reply as it lands in the view
  (`[res]`, per newly-persisted entry) and as seen by the stoa `afterResponse` hook
  in `room-extension.ts` (`[res-hook]`). Length, empty flag, stop reason (defensively
  peeked from runtime data; `n/a` when the harness exposes none).

Never logged: API keys, full user/assistant text. Only lengths, roles, flags, and
error strings.

## How to run

```bash
# 1. Prepare secrets (gitignored, referenced by path only)
cp server/.env.example server/.env   # then fill in VENICE_INFERENCE_KEY, MODEL, VENICE_BASE_URL

# 2. Build + start both containers
docker compose up --build -d         # server :8080 (WS /ws), web :8081

# 3. Watch server logs live
docker compose logs -f server
```

`docker compose config` validates with no secrets in the diff; `server/.env` is
excluded from the image by `.dockerignore` (`.env`) and from git by `.gitignore`.

## Log legend (what each line means)

| Tag | Meaning |
|-----|---------|
| `[ws]` | Connection open/close for a client (`conn=cN`). |
| `[msg]` | Every WS message received: type, `textLen` (length only), `room`, and `field` (`content` or `text` — which key actually carried the text). |
| `[req]` | Request context right before the harness runs the turn. `contentLen` = submitted length, `msgs=N` = number of conversation entries being sent, then one `[role len=L]` per message with `EMPTY CONTENT DETECTED` flag. **Key diagnostic line.** |
| `[res]` | Per-turn result from the view seam: `assistantLen=`, `empty=`, `stopReason=` for a new `pi.assistant` entry; `persistedEmpty kind=... len=0 EMPTY CONTENT DETECTED` for any other newly-persisted empty entry (e.g. the empty `pi.system`). |
| `[res-hook]` | Provider result at the stoa `afterResponse` hook: `assistantLen=`, `empty=`, `stopReason=`. |
| `[submit-reject]` / `[steer-reject]` | A submit/steer rejected before reaching the harness (no room, or non-string/empty `content`). Logs `reason=` and which field the client actually sent. |
| `[err]` | Uncaught error from the message handler (e.g. a harness/provider throw); exact error string logged. |

A `[msg]` + `[req]` + `[res]` trio with the same `corr=` value is one full
request/response round trip.

## Repro with logs (run against the container, :8080)

`ws` client joins `main`, then submits `hello` in both shapes the field was ever
sent with. Server log excerpt (`docker compose logs server`):

```
server-1  | [2026-10-02T18:13:50.256Z] [msg] conn=c1 t=join textLen=0 room=main
server-1  | [2026-10-02T18:13:50.676Z] [msg] conn=c1 t=submit textLen=5 field=text
server-1  | [2026-10-02T18:13:50.676Z] [submit-reject] conn=c1 corr=tmura7vmc-1 reason=missing-content-field clientSentField=text textLen=5
server-1  | [2026-10-02T18:13:51.083Z] [msg] conn=c1 t=submit textLen=5 field=content
server-1  | [2026-10-02T18:13:51.084Z] [req] conn=c1 corr=tmura7vxn-2 submit contentLen=5 msgs=0
server-1  | [2026-10-02T18:13:51.108Z] [res] conn=c1 corr=tmura7vxn-2 persistedEmpty kind=pi.system len=0 EMPTY CONTENT DETECTED
server-1  | [2026-10-02T18:13:51.771Z] [res-hook] assistantLen=0 empty=true stopReason=error
server-1  | [2026-10-02T18:13:51.781Z] [res] conn=c1 corr=tmura7vxn-2 assistantLen=0 empty=true stopReason=error
server-1  | [2026-10-02T18:14:18.951Z] [req] conn=c2 corr=tmura8hfp-3 submit contentLen=5 msgs=3 [user len=5] [system len=0 EMPTY CONTENT DETECTED] [assistant len=0 EMPTY CONTENT DETECTED]
server-1  | [2026-10-02T18:14:19.222Z] [res-hook] assistantLen=0 empty=true stopReason=error
server-1  | [2026-10-02T18:14:19.229Z] [res] conn=c2 corr=tmura8hfp-3 assistantLen=0 empty=true stopReason=error
```

### What the logs show about the live bug (observations only — no fix)

1. **The `text` field client is rejected locally, before the harness.** The
   ground-truth repro sends `{t:'submit', text:'hello'}`; the protocol field is
   `content`, so `msg.content` is `undefined` and the server's own guard returns
   `content must be a non-empty string`. That is the **immediate** error the
   reporter sees — it never reaches the provider. (`[submit-reject]
   reason=missing-content-field clientSentField=text`.)
2. **A single successful submit persists empty messages.** With the protocol
   `content` field, one `hello` submit produces commits `pi.user="hello"` →
   `pi.system=""` → `pi.assistant=""`. The empty `pi.system` is flagged
   (`persistedEmpty ... EMPTY CONTENT DETECTED`) and the assistant reply comes back
   **empty with `stopReason=error`** (`[res-hook] assistantLen=0 empty=true
   stopReason=error`). The harness does not throw here — it swallows the provider
   failure and persists the empty assistant entry.
3. **The next submit carries the poisoned context.** With the empty `pi.system` +
   `pi.assistant` in the transcript, the next `hello` request logs:
   `msgs=3 [user len=5] [system len=0 EMPTY CONTENT DETECTED] [assistant len=0 EMPTY CONTENT DETECTED]`
   and again resolves empty (`stopReason=error`). The empty messages are demonstrably
   in the request context — but the error string the reporter saw is produced by the
   local `content`-field guard (path 1), not thrown by the provider/harness in the
   container repro.

**Root cause is NOT changed or fixed here** (out of scope). The logs now make the
two contributing mechanisms visible: (a) the client's `text` field trips the local
validation guard, and (b) the provider/harness produces an empty assistant
(`stopReason=error`) that gets persisted and poisons subsequent turns.

## How to reset the poisoned room state

The room transcript (including the poisoned empty entries) lives in the sqlite DB
inside the `stoa-data` named volume → `/data/agent.sqlite`.

```bash
# Option A — wipe the whole stack's data and start clean
docker compose down -v && docker compose up -d

# Option B — reset just the DB file while containers keep running
docker compose exec server rm -f /data/agent.sqlite /data/agent.sqlite-*
docker compose restart server
```

For a bare (non-container) run, delete `server/agent.sqlite` the same way.

## Acceptance gates (run at head)

| # | Gate | Result |
|---|------|--------|
| 1 | `pnpm -C server run typecheck` | ✅ 0 errors |
| 1 | `pnpm -C server run smoke` | ✅ **12 passed, 0 failed** |
| 2 | `docker compose config` + `docker compose up --build` | ✅ both containers build & run; WS join→view handshake OK on `ws://localhost:8080/ws` |
| 3 | Repro log lines (request + empty-content flag + provider result/error) | ✅ excerpt above |
| 4 | `docker compose logs -f server` format | ✅ timestamped `[tag] conn=.. corr=..` lines |
| 5 | Hygiene | ✅ `git status` clean (only the 4 intended files + new `log.ts`); no `sk-`/key in diff; `server/.env` untracked, referenced by path only |

## What is running now

- `stoa-container-logs-2-server-1` (server :8080, WS /ws) — **up**
- `stoa-container-logs-2-web-1` (web :8081) — **up**
- The `main` room currently holds the reproduced poisoned transcript
  (`pi.user="hello"`, `pi.system=""`, `pi.assistant=""`), which is the live-bug
  state. Reset per the section above.

## Diff

- `server/src/log.ts` — new: timestamp/corr/conn helpers, `msgBrief`/`msgsBrief`
  (role + length + EMPTY flag, never text), defensive `extractStopReason`,
  `log`/`logErr`.
- `server/src/bridge.ts` — per-message logging, request-context logging before
  `conversation.submit`, submit/steer reject logging (with field detection),
  per-turn result logging in the view subscription, error logging in the catch.
- `server/src/room-extension.ts` — `[res-hook]` provider-result logging in
  `afterResponse`.
- `server/src/server.ts` — per-connection id + connect/disconnect log lines; passes
  `connId` into `handleClient`.
- `docker-compose.yml` — server gets env via `env_file: server/.env` (was host-env
  `${VAR:-}` substitution); Dockerfile `ENV` defaults cover PORT/STORAGE_PATH/MODEL.
  No image-embedded secrets.
