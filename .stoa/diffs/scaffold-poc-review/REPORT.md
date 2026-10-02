# Stoa POC Scaffold — PR #1 (poc-scaffold) Review

> **NOTE:** the original verdict below (BLOCKING) has been superseded by the fix commit `ed3bd0d`.
> See the **RE-VERIFICATION (fix commit ed3bd0d)** section at the end for the final verdict: **APPROVE-WITH-NITS**.

**Reviewed:** diff `prototype/` base `380308c` → head `6441491` (15 files, +3158), from `.stoa/diffs/scaffold-poc.diff` only.
**Context:** `brain/prototype.md` (UX-first POC, no neutrality).
**Verification:** gates re-run in an isolated scratch copy built from the diff (not the implementer's worktree): `typecheck` 0 errors, `build` 0 errors, `smoke` **15 passed / 0 failed** — all reproduce. Dockerfile also built (`docker build` OK) and the container boots, serves the SPA, opens `/ws`, and answers a join→view handshake against `/data` storage. So the scaffold compiles, boots, and its protocol *shell* is real.

---

## VERDICT: BLOCKING

The scaffold structure, Docker path, WS protocol envelope, and gates are all genuinely in place. But the **data path is broken at the Pi Durable API boundary** in four independent, concrete ways, and together they defeat the POC's three headline UX features — the live shared transcript, live streaming answers, and source chips — plus tool progress. The code reads the wrong fields of the actual (experimental) Pi Durable 1.0.0 types, and the source-ledger pipeline is never written or mounted. All four were confirmed against the published `@earendil-works/pi-durable@1.0.0` types and empirically reproduced against the built server. The fixes are small and mechanical, but as shipped the room cannot show a transcript, stream an answer, or attribute sources.

---

## BLOCKING

### B1. Transcript content is never extracted — every entry renders `(empty)`
- `prototype/src/bridge.ts:79-88` (`entryToSnapshot` / `extractEntryContent`), used by `buildSnapshot` and the commit path.

`EntryRecord` in Pi Durable 1.0.0 has **no `content` field**. Text lives in `model: readonly Message[]` (`types.d.ts`: `EntryRecord = { id, conversationId, kind, model?, data?, head?, ... }`); `UserEntry`/`AssistantEntry` are written with `{ model: [message] }` (`entries.js`). The bridge reads `raw["content"]`, which is always `undefined`, so `content` is always `""`. The SPA then renders `e.content || '(empty)'` (`public/index.html:225`).
- **Empirically reproduced:** after `{t:'submit', content:'Hello Stoa'}` the emitted commit entry is `{"id":"6","kind":"pi.user","role":"user","content":""}`. The shared room transcript — the entire point of the POC — shows "(empty)" for every message.
- **Fix:** extract from `raw["model"]?.[0]?.content` (string or content-block array), falling back to `data`.

### B2. Live answer streaming (`answer_delta`) never fires
- `prototype/src/bridge.ts:96-103` (snapshot `live.generation`) and `201-210` (subscribe delta extraction).

The bridge reads `pi.live.generation.text`, but the published `LiveState.generation` is `{ attempt, message?, retry?, deferred? }` (`harness/live.d.ts`) — **there is no `text` field**. The throttled partial answer is `generation.message` (an `AssistantMessage`). So `String(gen["text"] ?? "")` is always `""`:
- the view snapshot always reports `live.generation.text === ""`,
- `text.length > prevText.length` is always false → `{t:'answer_delta'}` is **never emitted**,
- the streaming bubble never activates (`public/index.html:248`),
- the **interrupt button is permanently disabled** because it keys off `liveGeneration.text` (`public/index.html:378`).
- **Fix:** derive text from `generation.message.content`, diff by content rather than by `text.length` prefix-slice.

### B3. Tool events are keyed by the wrong field (`id` vs `callId`)
- `prototype/src/bridge.ts:105` (snapshot tools) and `227` (delta tool extraction).

`pi.live.tools` is `ToolSlot[] = { callId, name, taskId?, status, output?, ... }` (`harness/live.d.ts`) — there is **no `id` field**. The bridge maps `id: String(t["id"] ?? "")`, so every `{t:'tool'}` and every snapshot tool slot has `id === ""`. The SPA keys the tool-progress map on `id` (`public/index.html:259-269`, `291-294`), so all tools collapse into a single overwritten entry and tool progress can't be displayed. `output` is also absent until a call is running, so the `output !== prevOutput` gate suppresses pending-call progress.
- **Fix:** use `callId`.

### B4. Source attribution is wired nowhere — `{t:'sources'}` can never fire
- `prototype/src/room-extension.ts:103` (hook memo) and `prototype/src/bridge.ts:235-238` (ledger reads).

Two independent breaks:
1. **The ledger doc is never mounted in the view.** `ConversationView.docs` contains only the four built-in docs — `harness/view.js`: `const MOUNTED = [AgentDoc, LiveDoc, InboxDoc, UsageDoc]`. Custom conversation docs like `room.source-ledger` are **not** part of `view.docs`, so `value.docs["room.source-ledger"]` is always `undefined` and the bridge's `ledger.records.length > prevLedger.records.length` gate never fires.
2. **Nothing ever writes the ledger.** The `afterResponse` hook only calls `api.memo("pendingSources", ...)` (task-scoped, durable memo) and never commits anything to `SourceLedgerDoc`. There is no answer-commit path that turns the memo into a `SourceLedgerState.records` entry. (Also, even the memo's `answerEntryId` is taken from `message.id`, an AssistantMessage id, not an `EntryRecord` id.)

So the required behavior "each answer records which contributions it drew on and emits them as `sources`" is absent: no `sources` message is ever sent, source chips never populate, and the `room.source-ledger` doc (`room-extension.ts:52`) is dead. The contribution rail cards are hardcoded HTML (`index.html:230-236`), and `list_contributions` (`room-extension.ts:80-96`) returns `[]` because `room.contributions` is never seeded — so even the attribution matcher has nothing to match. The extension's *types* and *registration* are correct; the *pipeline* is incomplete.
- **Fix:** write matched sources into `SourceLedgerDoc` (e.g. via `api.commit` on the answer entry id) and have the bridge read them (or expose sources another way, since custom docs aren't in `view.docs`). This is the largest of the four fixes.

---

## NITS

- **`commit` is not incremental.** `diffView` (`bridge.ts:146-149`) always emits a full `{op:'replace', path:'/entries', value:[...all entries]}` on *every* view advance, including pure live-text/tool ticks that don't change entries. The contract says commit is "(incremental) ... only what changed". It happens to work with the SPA's naive handler (`index.html:255-266`) but re-sends the whole transcript on every tick and defeats the watch() fidelity the spec banks on. `REPORT.md:56` documents this as a deviation, yet the same file claims "Deviations from spec: None" (`REPORT.md:53`) — inconsistent self-reporting.
- **Smoke assertions are weak where they claim clean shutdown.** `smoke.mjs:174` passes trivially: `serverProcess.killed` becomes `true` immediately after `kill("SIGTERM")`, so it never verifies the process actually exited.
- **Smoke failure path is broken.** `smoke.mjs:199` calls `require("node:fs")` in an ESM `.mjs` module — `ReferenceError: require is not defined` in exactly the error path that's supposed to clean up. Latent, but real.
- **`join`'s `room` field is accepted and ignored** — every join does `harness.root(...)` (`bridge.ts:163-171`). Fine for a one-room POC, but the field is dead and the spec's `harness.root(room)` mapping is not honored.
- **WS input is only shape-cast, not validated.** Unknown `t` values are silently dropped; a `submit` with missing `content` forwards `undefined` into the harness and surfaces as a generic `{t:'error', message:'<harness exception>'}` rather than a clean protocol rejection. No message-size cap or rate limit. Acceptable for a POC; worth a `validateClientMessage()` guard.

## OBSERVATIONS

- **Exactly-once is correctly wired, but never exercised.** `requestId` is forwarded into `conversation.submit` (`bridge.ts:270`), and Pi Durable dedups by `requestId` via `submissionByRequest` (`submissions.js` — "A known request ID returns its existing submission without writing"). Good. But the SPA always generates a fresh `requestId` and never re-sends after reconnect (`index.html:334-336`), so the safety net is purely latent server-side behavior.
- **Extension activation is correct.** `registry.install(RoomExtension)` + `settings.extensions: [RoomExtension]` (`server.ts:64-73`) is the right way to make the room tool/hook the default selection for the root conversation — `HarnessSettings.extensions` is "default extension selection; absent: every installed extension". So once B4 is fixed the tool/hook plumbing will reach the model.
- **Model key path is clean.** `PROVIDER_KEY` is read from env only, default `""`, never committed; it's applied by setting `process.env.OPENAI_API_KEY` before `models.setProvider(openaiProvider())` (`server.ts:47-50`). Default `MODEL=gpt-5-mini` is documented in `config.ts`/`README.md`. No secrets in the diff.
- **Crash recovery hook is present:** `harness.resume()` after `Harness.open` and before serving (`server.ts:79-80`), graceful SIGINT/SIGTERM → `harness.close` + `storage.close`. Matches the spec.
- **serveStatic is traversal-safe in practice:** `new URL()` collapses dot-segments and the `existsSync` guard means only real files under `public/` are served; no `Cache-Control` headers (fine for POC).
- **Dockerfile is sound and verified:** `node:22-alpine`, `npm ci --ignore-scripts` (0 vulnerabilities; the blocked esbuild/genai/protobufjs install scripts did not break the build because the esbuild platform binary arrives via optionalDependencies), `tsc` build inside the image, `EXPOSE 8080`, `VOLUME /data`, `ENV STORAGE_PATH=/data/agent.sqlite`, `CMD node dist/server.js`. `docker-compose.yml` passes `PROVIDER_KEY`/`MODEL` and mounts `stoa-data:/data`; it relies on the Dockerfile's `STORAGE_PATH` default (not set in compose) — works. Verified: image builds, container boots, serves `index.html` (HTTP 200), and answers a WS join→view handshake on `/data/agent.sqlite`.
- **`node:sqlite` prints an `ExperimentalWarning` at boot** — cosmetic; the storage adapter works (proven by boot + persistence).
- **`whenBusy` default `"followUp"`** (`bridge.ts:271`) matches the spec's "steer queued behind current tools" semantics; `steer` is a distinct message (`bridge.ts:283-296`), `interrupt` maps to `conversation.abort` (`bridge.ts:299`), and `fork`/`configure` return explicit "not yet implemented" errors — all as the contract allows.
- **Milestone-1 demo is achievable only with a model key in the current state** — and even then the transcript/streaming/sources bugs above would be visible. The smoke's no-key pass (15/0) is meaningful only as a boot/handshake check, which is exactly what the contract asked for.

---

## Suggested merge path

All BLOCKING items are localized to two files and are mechanical: extract text from `model[0].content` (B1), read `pi.live.generation.message.content` (B2), use `callId` (B3), and complete the memo→ledger commit + bridge read for sources (B4, the one structural change). The scaffold's shape, Docker path, protocol envelope, and gates are otherwise solid and approve-able once those land.

---

# RE-VERIFICATION (fix commit ed3bd0d)

**Reviewed:** `.stoa/diffs/scaffold-poc-fix.diff` — base `6441491` → head `ed3bd0d` (5 files, +365/−104).
**Verification method:** applied both diffs to a fresh scratch copy (never the worktree), `npm ci` → `typecheck` **0 errors**, `build` **0 errors**, `smoke` **15 passed / 0 failed** — all reproduced at the new head, including the new B1 transcript-content check. Then ran custom WS probes against the built server for B1 (real submit → committed content) and B4 (full source pipeline, via a clearly-marked **test-only** `test_inject` case added to the *scratch* `bridge.ts` — not part of the PR — to synthesize an assistant answer without a model key).

## B1 — RESOLVED
`extractEntryText` (`src/bridge.ts:80`) now reads `raw["model"][0].content` (string or content-block array) with a `data` fallback, used in `entryToSnapshot` (`bridge.ts:117` region), inbox items, and answer-text extraction. **Empirically confirmed:** `{t:'submit', content:'Hello Stoa'}` produced a committed `pi.user` entry with `content:"Hello Stoa"` (previously `""`); smoke's own content check passes (`smoke.mjs:170`).

## B2 — RESOLVED (code + types; not end-to-end without a model key)
`extractGenText` (`src/bridge.ts:125`) derives text from `pi.live.generation.message.content` — the correct field per `LiveState.generation = {attempt, message?, retry?, deferred?}` — and deltas are sliced from the joined text (`bridge.ts:590-594`). Interrupt is now enabled whenever `liveGeneration` is non-null (`public/index.html:379`). Actual `answer_delta` emission needs `PROVIDER_KEY` (no live generation without a provider), so it was verified at the code+type level only — explicitly **not end-to-end tested**.

## B3 — RESOLVED (code + types; tool round not end-to-end tested)
All tool keys now use `callId`: snapshot (`bridge.ts:146`), delta emission (`bridge.ts:352`, `id: callId` at `bridge.ts:360`), and the SPA's tool map. The emit condition no longer suppresses a brand-new call with empty output (`bridge.ts:355`): `output !== prevOutput || (output==="" && prevOutput==="" && callId && new callId)` — so pending-call progress is broadcast. Real tool execution needs a model key; verified at the code+type level.

## B4 — RESOLVED (empirically verified end-to-end)
The pipeline is now genuinely wired: contributions are **seeded** on first join via `conversation.commit` + `tx.doc(ContributionsDoc, …)` (`seedContributions`, `bridge.ts:483`; log "Seeded contributions with 2 items" confirmed), the bridge **matches** assistant answer text against seeded contributions (`matchContributions`, `bridge.ts:236` region), **commits** matched records to `SourceLedgerDoc` via `conversation.commit` + `tx.doc` (auto-creating the doc with `initial()`), and **emits** `{t:'sources'}` (`bridge.ts:376`); late joiners get sources re-emitted on join (`bridge.ts:572`). **Empirically confirmed:** injecting a synthetic assistant answer (scratch-only test hook) produced `{t:'sources', refs:[{answerEntryId:"7", contributionIds:["seed-1","seed-2"]}]}`, no errors, and the same refs re-emitted to a second connection that joined afterwards. `list_contributions` reads the now-seeded doc, so it returns real data once a model invokes it (needs a key to run). The old `view.docs["room.source-ledger"]` read (never mounted) is gone; the design correctly works around the built-in-only view docs.

## Nits — RESOLVED
- **Incremental commits:** `diffEntries` (`bridge.ts:181`) emits a commit op only when the entry-id set changes; pure live/tool ticks emit nothing (observed: 1 commit after submit, previously 3 with 2 redundant full replaces).
- **Smoke exit is real:** awaits `serverProcess.on("exit")` with a 5 s timeout (`smoke.mjs:245`), no longer the trivial `.killed` check.
- **ESM-safe cleanup:** `import { unlinkSync, existsSync }` (`smoke.mjs:16`) used in both the success and error paths — no `require`.
- **WS validation:** `submit`/`steer` reject non-string/blank content with a clean error (`bridge.ts:390`, `411`); unknown message types return an explicit error (`bridge.ts:467`); `configure` always returns the explicit not-implemented error. **Empirically confirmed** (`"content must be a non-empty string"`, `"Unknown message type: nonsense_type"`).
- **REPORT.md self-reporting:** deviations are now honestly documented (non-incremental commit op shape, fork/configure unimplemented, `room` ignored, custom docs not in view).

## Residual NITs (non-blocking)
- **SPA live-generation lifecycle:** `liveGeneration` is only (re)set on a `view` snapshot, never cleared on commit — after an answer completes, the streaming bubble persists and the interrupt button stays enabled until the next reconnect. Cosmetic; a no-op `abort` when idle is harmless. (Pre-existing, not part of the four blockers.)
- **`answer_delta` is a prefix-length diff** — correct while throttled partials only grow, but it can stall then jump if a retry/regeneration rewrites earlier text. Acceptable for a POC.
- **Tool diff is index-aligned** against the previous round — fine while a round appends calls in order, fragile to reordering. Acceptable.
- **`emitSourcesIfNew` is fire-and-forget from the subscribe callback** (not awaited); empirically safe here (no deadlock, `sentSourceEntryIds` prevents duplicates) and commit errors are caught, but a `harness.snapshot` rejection there is uncaught. POC-acceptable.
- **Matching logic is duplicated** (`matchContributions` in `bridge.ts` vs the hook's loop in `room-extension.ts`) — drift risk; the hook's memo is currently unused by the bridge. Consider consolidating.

## Final verdict: APPROVE-WITH-NITS
All four BLOCKING findings are genuinely resolved and, where testable without a key, empirically confirmed (B1, B4, validation, incremental commits). B2/B3 are correctly wired against the published 1.0.0 types but could not be exercised end-to-end without `PROVIDER_KEY`. Remaining items are cosmetic/lifecycle NITs. Merge is safe for the scaffold; the residual SPA streaming-bubble/interrupt lifecycle is the only thing worth a follow-up before the milestone-1 demo.
