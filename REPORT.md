# Stop sending `chat_template_kwargs` to Venice — Fix Report

**Branch:** `fix-venice-thinking-format` (off `main` @ `6dc94aa`)
**PR:** `fix-venice-thinking-format` → `main` (title: "fix: stop sending chat_template_kwargs to Venice (empty-reply 400)")
**Date:** 2026-10-02
**Scope:** SMALL, SINGLE-CONCERN FIX — zero other behavior change. Only `server/src/server.ts`
edited. `shared/`, `web/`, `bridge.ts` untouched.

## Root cause (pre-verified — not re-derived here)

`server/src/server.ts` declared the Venice provider compat as
`thinkingFormat: "qwen-chat-template"`. pi-ai's openai-completions `buildParams` hardcodes
that branch and emits a `chat_template_kwargs` object on **every** request. **Venice rejects
that key**: a direct probe returned HTTP 400 `Invalid request parameters` /
`issues: [{code:'unrecognized_keys', keys:['chat_template_kwargs']}]`. Removing
`chat_template_kwargs` returns HTTP 200 with a real answer. pi-durable persists the 400 as
an empty `pi.assistant` entry (`stopReason:error`) — the empty reply the user sees.
Secondary: `chatTemplateKwargs: { enable_thinking: true, preserve_thinking: false }` was
**inert** anyway, because the `qwen-chat-template` branch it feeds is never taken by
Venice's openai-completions path.

## Chosen fix + why

In `server/src/server.ts`, compat block:

```diff
           maxTokensField: "max_tokens",
-          thinkingFormat: "qwen-chat-template",
-          chatTemplateKwargs: { enable_thinking: true, preserve_thinking: false },
+          thinkingFormat: "openai",
           requiresReasoningContentOnAssistantMessages: true,
```

- `thinkingFormat` → `"openai"`: the openai-completions build path (the only path Venice
  speaks) no longer takes the hardcoded `qwen-chat-template` branch, so
  `chat_template_kwargs` is never constructed.
- `chatTemplateKwargs` line **dropped entirely**: under `"openai"` the flag would be
  meaningless at best; dropping it guarantees the rejected key can never appear in any
  request payload, whatever pi-ai does with compat flags.
- `requiresReasoningContentOnAssistantMessages` **kept** — unrelated to the rejected key;
  not part of the probe failure.
- **Declared thinking intent:** the old config wanted `enable_thinking: true`, but that
  flag was provably inert under `qwen-chat-template` (the branch is never taken). Under
  `"openai"`, thinking is expressed through pi-ai's reasoning-effort path: the model keeps
  `reasoning: true` and the existing `thinkingLevelMap` (minimal…max → low/medium/high)
  unchanged. Per the acceptance contract, a **working reply is the priority**; whether
  Venice surfaces thinking content for `deepseek-v4-flash-0731` is orthogonal to this 400
  and left at the model default. No new feature was added.

## Acceptance gates

| # | Gate | Exact command | Result |
|---|------|---------------|--------|
| 1 | Server typecheck 0 errors | `pnpm -C server run typecheck` | ✅ exit 0, 0 errors (fresh worktree needs `pnpm -C shared run build` first — no `shared/dist`; artifacts are gitignored) |
| 2 | Server smoke | `pnpm -C server run smoke` | ✅ **12 passed, 0 failed** |
| 3 | E2E proof (money gate) | ws client → `ws://localhost:8080/ws`, join `main`, submit `{t:'submit', content:'hello', requestId:'t1'}` | ✅ before/after snapshot + `[res-hook] assistantLen>0`, see below |
| 4 | Repo hygiene | `git status` / `git diff` | ✅ only `server/src/server.ts` + `REPORT.md` changed; no keys in diff; no stray files |

### Gate 1–2 detail

```
$ pnpm -C shared run build && pnpm -C server run build && pnpm -C server run typecheck
$ tsc --noEmit            # 0 errors

$ pnpm -C server run smoke
Results: 12 passed, 0 failed
```
(Smoke caveats — no `VENICE_INFERENCE_KEY`, so no live model answer — are the pre-existing
expected behavior of the smoke test itself.)

### Gate 3 — E2E proof (fixed code + diagnostic instrumentation)

The acceptance requires the `[res-hook]` log line. That instrumentation lives on the
diagnostic branch (`add-server-logs-docker2`, the stack the investigation used), which
still carried the **buggy** compat. To prove the fix through exactly that seam without
touching any worktree, the diagnostic branch was copied to an isolated scratch dir
(`/tmp/stoa-e2e`), the **identical one-line fix** applied (compat block verified
byte-identical to the shipped commit), the poisoned room reset
(`docker compose down -v`), and the stack rebuilt (`docker compose up -d --build`) with
the real `VENICE_INFERENCE_KEY` (via the branch's `env_file: server/.env`).

**BEFORE** — view snapshot after join (room clean after `down -v`):
```json
{ "entriesCount": 0, "entries": [], "live": { "generation": null, "tools": [] }, "inbox": [] }
```

**AFTER** — view snapshot after submitting `{t:'submit', content:'hello', requestId:'t1'}`:
```json
{
  "entriesCount": 3,
  "entries": [
    { "id": "7",  "kind": "pi.user",      "role": "user",      "content": "hello",                            "contentLen": 5 },
    { "id": "10", "kind": "pi.system",     "role": "system",     "content": "",                                "contentLen": 0 },
    { "id": "11", "kind": "pi.assistant",  "role": "assistant",  "content": "Hello! How can I help you today?", "contentLen": 32 }
  ],
  "live": { "generation": null, "tools": [] },
  "inbox": []
}
```
`RESULT: PASS — non-empty assistant reply` · commits=3 deltas=1 **errors=0**

**Container logs** — the money line (and no 400 anywhere):
```
[2026-10-02T18:35:30.382Z] [msg] conn=c1 t=submit textLen=5 field=content
[2026-10-02T18:35:30.382Z] [req] conn=c1 corr=tmurazqha-1 submit contentLen=5 msgs=0
[2026-10-02T18:35:32.052Z] [res-hook] assistantLen=32 empty=false stopReason=stop
[2026-10-02T18:35:32.058Z] [res] conn=c1 corr=tmurazqha-1 assistantLen=32 empty=false stopReason=stop
```
`[res-hook] assistantLen=32 empty=false` — **not** `empty=true`. Venice accepted the
request (no `chat_template_kwargs` → no 400 → real HTTP 200 answer), and pi-durable
persisted a non-empty `pi.assistant` entry.

## Diff

- `server/src/server.ts` — compat block: `thinkingFormat: "qwen-chat-template"` →
  `"openai"`; `chatTemplateKwargs` line removed. Nothing else changed.
