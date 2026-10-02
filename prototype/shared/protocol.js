// ── Stoa WS Protocol — single source of truth ─────────────────────────────
// Consumed by server/ (TypeScript, via protocol.d.ts) and web/ (browser ESM).
// Keep README.md's protocol table in sync with this file.

/** @type {string} */
export const WS_PATH = "/ws";

/** @type {number} */
export const WS_DEFAULT_PORT = 8080;

/** @type {string} */
export const DEFAULT_WS_URL = `ws://localhost:${WS_DEFAULT_PORT}${WS_PATH}`;

// ── Client → Server messages ───────────────────────────────────────────

/**
 * @typedef {{ t: "join"; room: string }} JoinMessage
 * @typedef {{ t: "submit"; content: string; requestId: string; whenBusy?: "steer"|"followUp"|"reject" }} SubmitMessage
 * @typedef {{ t: "steer"; content: string }} SteerMessage
 * @typedef {{ t: "interrupt" }} InterruptMessage
 * @typedef {{ t: "fork"; atAnswerId: string; content?: string }} ForkMessage
 * @typedef {{ t: "configure"; tools?: string[] }} ConfigureMessage
 * @typedef {{ t: "ping" }} PingMessage
 *
 * @typedef {JoinMessage|SubmitMessage|SteerMessage|InterruptMessage|ForkMessage|ConfigureMessage|PingMessage} ClientMessage
 */

/**
 * @param {string} room
 * @returns {JoinMessage}
 */
export function makeJoin(room) {
  return { t: "join", room };
}

/**
 * @param {string} content
 * @param {string} requestId
 * @param {"steer"|"followUp"|"reject"} [whenBusy]
 * @returns {SubmitMessage}
 */
export function makeSubmit(content, requestId, whenBusy) {
  return { t: "submit", content, requestId, ...(whenBusy ? { whenBusy } : {}) };
}

/**
 * @param {string} content
 * @returns {SteerMessage}
 */
export function makeSteer(content) {
  return { t: "steer", content };
}

/**
 * @returns {InterruptMessage}
 */
export function makeInterrupt() {
  return { t: "interrupt" };
}

/**
 * @returns {PingMessage}
 */
export function makePing() {
  return { t: "ping" };
}

// ── Server → Client messages ───────────────────────────────────────────

/**
 * @typedef {Object} EntrySnapshot
 * @property {string} id
 * @property {string} kind
 * @property {string} role
 * @property {string} content
 *
 * @typedef {Object} LiveSnapshot
 * @property {{text:string}|null} generation
 * @property {{id:string,name:string,output:string}[]} tools
 *
 * @typedef {Object} InboxSnapshot
 * @property {string} id
 * @property {string} content
 * @property {string} [requestId]
 *
 * @typedef {Object} Snapshot
 * @property {EntrySnapshot[]} entries
 * @property {LiveSnapshot|null} live
 * @property {InboxSnapshot[]} inbox
 * @property {*} agent
 * @property {*} usage
 *
 * @typedef {Object} Op
 * @property {string} op
 * @property {string} path
 * @property {*} [value]
 *
 * @typedef {Object} SourceRef
 * @property {string} answerEntryId
 * @property {string[]} contributionIds
 *
 * @typedef {{ t: "view"; snapshot: Snapshot }} ViewMessage
 * @typedef {{ t: "commit"; ops: Op[] }} CommitMessage
 * @typedef {{ t: "answer_delta"; text: string }} AnswerDeltaMessage
 * @typedef {{ t: "tool"; id: string; name: string; output: string }} ToolMessage
 * @typedef {{ t: "sources"; refs: SourceRef[] }} SourcesMessage
 * @typedef {{ t: "error"; message: string }} ErrorMessage
 *
 * @typedef {ViewMessage|CommitMessage|AnswerDeltaMessage|ToolMessage|SourcesMessage|ErrorMessage} ServerMessage
 */

// ── Type guards ────────────────────────────────────────────────────────

/**
 * @param {*} m
 * @returns {m is ViewMessage}
 */
export function isView(m) {
  return m && m.t === "view";
}

/**
 * @param {*} m
 * @returns {m is CommitMessage}
 */
export function isCommit(m) {
  return m && m.t === "commit";
}

/**
 * @param {*} m
 * @returns {m is AnswerDeltaMessage}
 */
export function isAnswerDelta(m) {
  return m && m.t === "answer_delta";
}

/**
 * @param {*} m
 * @returns {m is ToolMessage}
 */
export function isTool(m) {
  return m && m.t === "tool";
}

/**
 * @param {*} m
 * @returns {m is SourcesMessage}
 */
export function isSources(m) {
  return m && m.t === "sources";
}

/**
 * @param {*} m
 * @returns {m is ErrorMessage}
 */
export function isError(m) {
  return m && m.t === "error";
}

/**
 * @param {*} m
 * @returns {m is JoinMessage}
 */
export function isJoin(m) {
  return m && m.t === "join";
}

/**
 * @param {*} m
 * @returns {m is SubmitMessage}
 */
export function isSubmit(m) {
  return m && m.t === "submit";
}

/**
 * @param {*} m
 * @returns {m is SteerMessage}
 */
export function isSteer(m) {
  return m && m.t === "steer";
}

/**
 * @param {*} m
 * @returns {m is InterruptMessage}
 */
export function isInterrupt(m) {
  return m && m.t === "interrupt";
}

/**
 * @param {*} m
 * @returns {m is PingMessage}
 */
export function isPing(m) {
  return m && m.t === "ping";
}
