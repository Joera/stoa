// ── Stoa WS Protocol — single source of truth ─────────────────────────────
// TypeScript source for the @stoa/shared workspace package. Compiled with
// `tsc --declaration` to dist/ (JS + .d.ts). Consumed by:
//   - server/  — node resolves the built package by name (@stoa/shared)
//   - web/     — esbuild bundles this raw TS source (alias @stoa/shared → shared/src)
// Keep README.md's protocol table in sync with this file.

// ── Constants ──────────────────────────────────────────────────────────────

export const WS_PATH: string = "/ws";

export const WS_DEFAULT_PORT: number = 8080;

export const DEFAULT_WS_URL: string = `ws://localhost:${WS_DEFAULT_PORT}${WS_PATH}`;

// ── Client → Server messages ────────────────────────────────────────────────

export type JoinMessage = { t: "join"; room: string };
export type SubmitMessage = {
  t: "submit";
  content: string;
  requestId: string;
  whenBusy?: "steer" | "followUp" | "reject";
};
export type SteerMessage = { t: "steer"; content: string };
export type InterruptMessage = { t: "interrupt" };
export type ForkMessage = { t: "fork"; atAnswerId: string; content?: string };
export type ConfigureMessage = { t: "configure"; tools?: string[] };
export type PingMessage = { t: "ping" };

export type ClientMessage =
  | JoinMessage
  | SubmitMessage
  | SteerMessage
  | InterruptMessage
  | ForkMessage
  | ConfigureMessage
  | PingMessage;

export function makeJoin(room: string): JoinMessage {
  return { t: "join", room };
}

export function makeSubmit(
  content: string,
  requestId: string,
  whenBusy?: "steer" | "followUp" | "reject"
): SubmitMessage {
  return { t: "submit", content, requestId, ...(whenBusy ? { whenBusy } : {}) };
}

export function makeSteer(content: string): SteerMessage {
  return { t: "steer", content };
}

export function makeInterrupt(): InterruptMessage {
  return { t: "interrupt" };
}

export function makePing(): PingMessage {
  return { t: "ping" };
}

// ── Server → Client messages ───────────────────────────────────────────────

export interface EntrySnapshot {
  id: string;
  kind: string;
  role: string;
  content: string;
}

export interface LiveSnapshot {
  generation: { text: string } | null;
  tools: { id: string; name: string; output: string }[];
}

export interface InboxSnapshot {
  id: string;
  content: string;
  requestId?: string;
}

export interface Snapshot {
  entries: EntrySnapshot[];
  live: LiveSnapshot | null;
  inbox: InboxSnapshot[];
  agent: unknown;
  usage: unknown;
}

export interface Op {
  op: string;
  path: string;
  value?: unknown;
}

export interface SourceRef {
  answerEntryId: string;
  contributionIds: string[];
}

export type ViewMessage = { t: "view"; snapshot: Snapshot };
export type CommitMessage = { t: "commit"; ops: Op[] };
export type AnswerDeltaMessage = { t: "answer_delta"; text: string };
export type ToolMessage = { t: "tool"; id: string; name: string; output: string };
export type SourcesMessage = { t: "sources"; refs: SourceRef[] };
export type ErrorMessage = { t: "error"; message: string };

export type ServerMessage =
  | ViewMessage
  | CommitMessage
  | AnswerDeltaMessage
  | ToolMessage
  | SourcesMessage
  | ErrorMessage;

// ── Type guards ────────────────────────────────────────────────────────────

function isMessageWithT(m: unknown, t: string): boolean {
  return typeof m === "object" && m !== null && (m as { t?: unknown }).t === t;
}

export function isView(m: unknown): m is ViewMessage {
  return isMessageWithT(m, "view");
}

export function isCommit(m: unknown): m is CommitMessage {
  return isMessageWithT(m, "commit");
}

export function isAnswerDelta(m: unknown): m is AnswerDeltaMessage {
  return isMessageWithT(m, "answer_delta");
}

export function isTool(m: unknown): m is ToolMessage {
  return isMessageWithT(m, "tool");
}

export function isSources(m: unknown): m is SourcesMessage {
  return isMessageWithT(m, "sources");
}

export function isError(m: unknown): m is ErrorMessage {
  return isMessageWithT(m, "error");
}

export function isJoin(m: unknown): m is JoinMessage {
  return isMessageWithT(m, "join");
}

export function isSubmit(m: unknown): m is SubmitMessage {
  return isMessageWithT(m, "submit");
}

export function isSteer(m: unknown): m is SteerMessage {
  return isMessageWithT(m, "steer");
}

export function isInterrupt(m: unknown): m is InterruptMessage {
  return isMessageWithT(m, "interrupt");
}

export function isPing(m: unknown): m is PingMessage {
  return isMessageWithT(m, "ping");
}
