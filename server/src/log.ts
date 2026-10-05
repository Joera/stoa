/**
 * Server-side request/response logging for diagnosing live issues.
 *
 * All output goes through console.log / console.error → stdout/stderr, which is
 * what `docker compose logs -f server` tails. Rules enforced here:
 *   - NEVER log the API key or full user/assistant text.
 *   - Log lengths / roles / emptiness flags only (plus a defensive stop-reason
 *     peek at runtime data handed to us by the harness — no pi-ai internals).
 *
 * This file lives in server/src/ (the allowed instrumentation seam). It does
 * not import anything from node_modules beyond nothing at all.
 */

let connCounter = 0;
let corrCounter = 0;

/** Short stable id for one WS connection, so log lines can be correlated. */
export function nextConnId(): string {
  connCounter += 1;
  return `c${connCounter}`;
}

/** ISO timestamp prefix for every line. */
export function ts(): string {
  return new Date().toISOString();
}

/** Per-turn correlation id (one per submit/steer). */
export function nextCorr(): string {
  corrCounter += 1;
  return `t${Date.now().toString(36)}-${corrCounter}`;
}

/** Length + emptiness of some text (no content is ever emitted). */
export function lenInfo(text: string | undefined): { len: number; empty: boolean } {
  const s = text ?? "";
  return { len: s.length, empty: s.trim().length === 0 };
}

/**
 * One message's brief: role + content length, flagging empty/whitespace content.
 * e.g. `[assistant len=0 EMPTY CONTENT DETECTED]`
 */
export function msgBrief(role: string, text: string | undefined): string {
  const { len, empty } = lenInfo(text);
  return `[${role} len=${len}${empty ? " EMPTY CONTENT DETECTED" : ""}]`;
}

/** Compact line for a whole message list (the request context as stoa sees it). */
export function msgsBrief(
  msgs: Array<{ role: string; content: string | undefined }>
): string {
  return msgs.map((m) => msgBrief(m.role, m.content)).join(" ");
}

/**
 * Defensively peek at runtime data for a stop reason. We don't know the exact
 * shape of harness messages, so we check the common key spellings on the object
 * itself and on its first `model` element. `n/a` when not present.
 */
export function extractStopReason(obj: unknown): string {
  if (obj == null) return "n/a";
  const r = obj as Record<string, unknown>;
  for (const k of ["stopReason", "stop_reason", "finishReason", "finish_reason"]) {
    const v = r[k];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  const model = r["model"];
  if (Array.isArray(model) && model.length > 0) {
    const first = model[0] as Record<string, unknown>;
    for (const k of ["stopReason", "stop_reason", "finishReason", "finish_reason"]) {
      const v = first[k];
      if (typeof v === "string" && v.length > 0) return v;
      if (typeof v === "number") return String(v);
    }
  }
  return "n/a";
}

/** Info-level line with tag + correlation id. */
export function log(tag: string, corr: string | null, msg: string, connId?: string): void {
  const c = corr ? ` corr=${corr}` : "";
  const cn = connId ? ` conn=${connId}` : "";
  console.log(`[${ts()}] [${tag}]${cn}${c} ${msg}`);
}

/** Error-level line with tag + correlation id. */
export function logErr(tag: string, corr: string | null, msg: string, connId?: string): void {
  const c = corr ? ` corr=${corr}` : "";
  const cn = connId ? ` conn=${connId}` : "";
  console.error(`[${ts()}] [${tag}]${cn}${c} ${msg}`);
}
