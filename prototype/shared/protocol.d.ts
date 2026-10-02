// TypeScript declarations for shared/protocol.js — consumed by server/

export const WS_PATH: string;
export const WS_DEFAULT_PORT: number;
export const DEFAULT_WS_URL: string;

// Client messages
export type JoinMessage = { t: "join"; room: string };
export type SubmitMessage = { t: "submit"; content: string; requestId: string; whenBusy?: "steer" | "followUp" | "reject" };
export type SteerMessage = { t: "steer"; content: string };
export type InterruptMessage = { t: "interrupt" };
export type ForkMessage = { t: "fork"; atAnswerId: string; content?: string };
export type ConfigureMessage = { t: "configure"; tools?: string[] };
export type PingMessage = { t: "ping" };

export type ClientMessage = JoinMessage | SubmitMessage | SteerMessage | InterruptMessage | ForkMessage | ConfigureMessage | PingMessage;

export function makeJoin(room: string): JoinMessage;
export function makeSubmit(content: string, requestId: string, whenBusy?: "steer" | "followUp" | "reject"): SubmitMessage;
export function makeSteer(content: string): SteerMessage;
export function makeInterrupt(): InterruptMessage;
export function makePing(): PingMessage;

// Server messages
export interface EntrySnapshot { id: string; kind: string; role: string; content: string; }
export interface LiveSnapshot { generation: { text: string } | null; tools: { id: string; name: string; output: string }[]; }
export interface InboxSnapshot { id: string; content: string; requestId?: string; }
export interface Snapshot { entries: EntrySnapshot[]; live: LiveSnapshot | null; inbox: InboxSnapshot[]; agent: unknown; usage: unknown; }
export interface Op { op: string; path: string; value?: unknown; }
export interface SourceRef { answerEntryId: string; contributionIds: string[]; }

export type ViewMessage = { t: "view"; snapshot: Snapshot };
export type CommitMessage = { t: "commit"; ops: Op[] };
export type AnswerDeltaMessage = { t: "answer_delta"; text: string };
export type ToolMessage = { t: "tool"; id: string; name: string; output: string };
export type SourcesMessage = { t: "sources"; refs: SourceRef[] };
export type ErrorMessage = { t: "error"; message: string };

export type ServerMessage = ViewMessage | CommitMessage | AnswerDeltaMessage | ToolMessage | SourcesMessage | ErrorMessage;

// Type guards
export function isView(m: unknown): m is ViewMessage;
export function isCommit(m: unknown): m is CommitMessage;
export function isAnswerDelta(m: unknown): m is AnswerDeltaMessage;
export function isTool(m: unknown): m is ToolMessage;
export function isSources(m: unknown): m is SourcesMessage;
export function isError(m: unknown): m is ErrorMessage;
export function isJoin(m: unknown): m is JoinMessage;
export function isSubmit(m: unknown): m is SubmitMessage;
export function isSteer(m: unknown): m is SteerMessage;
export function isInterrupt(m: unknown): m is InterruptMessage;
export function isPing(m: unknown): m is PingMessage;
