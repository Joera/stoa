import type { Context } from "@earendil-works/chord";
import type { Conversation, ConversationView, Harness, EntryRecord } from "@earendil-works/pi-durable";
import type { WebSocket } from "ws";
import {
  ContributionsDoc,
  SourceLedgerDoc,
  type Contribution,
  type SourceRecord,
} from "./room-extension.js";

// ── Protocol types ─────────────────────────────────────────────────────────

export type ClientMessage =
  | { t: "join"; room: string }
  | { t: "submit"; content: string; requestId: string; whenBusy?: "steer" | "followUp" | "reject" }
  | { t: "steer"; content: string }
  | { t: "interrupt" }
  | { t: "fork"; atAnswerId: string; content?: string }
  | { t: "configure"; tools?: string[] }
  | { t: "ping" };

export type ServerMessage =
  | { t: "view"; snapshot: Snapshot }
  | { t: "commit"; ops: Op[] }
  | { t: "answer_delta"; text: string }
  | { t: "tool"; id: string; name: string; output: string }
  | { t: "sources"; refs: SourceRef[] }
  | { t: "error"; message: string };

export interface Snapshot {
  entries: EntrySnapshot[];
  live: LiveSnapshot | null;
  inbox: InboxSnapshot[];
  agent: unknown;
  usage: unknown;
}

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

export interface Op {
  op: string;
  path: string;
  value?: unknown;
}

export interface SourceRef {
  answerEntryId: string;
  contributionIds: string[];
}

// ── Text extraction helpers ────────────────────────────────────────────────

/**
 * Extract readable text from an EntryRecord.
 * In pi-durable 1.0.0, EntryRecord has `model?: readonly Message[]` and `data?: JsonValue`
 * — there is NO `content` field. Text lives in `model[0].content` (string or content-block array).
 */
function extractEntryText(raw: Record<string, unknown>): string | undefined {
  const model = raw["model"];
  if (Array.isArray(model) && model.length > 0) {
    const first = model[0] as Record<string, unknown>;
    const content = first["content"];
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return (content as Array<{ type: string; text?: string }>)
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n");
    }
  }
  // Fallback: data field
  const data = raw["data"];
  if (typeof data === "string") return data;
  return undefined;
}

/**
 * Extract streaming text from a generation message.
 * gen.message is JsonRepresentation<AssistantMessage> from pi.live.
 */
function extractGenText(gen: Record<string, unknown>): string {
  const msg = gen["message"] as Record<string, unknown> | undefined;
  if (!msg) return "";
  const content = msg["content"];
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as Array<{ type: string; text?: string }>)
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");
  }
  return "";
}

// ── Build snapshot ─────────────────────────────────────────────────────────

function entryToSnapshot(e: EntryRecord): EntrySnapshot {
  const raw = e as unknown as Record<string, unknown>;
  const kind = String(raw["kind"] ?? "");
  return {
    id: String(raw["id"] ?? ""),
    kind,
    role: kindToRole(kind),
    content: extractEntryText(raw) ?? "",
  };
}

function kindToRole(kind: string): string {
  if (kind === "pi.user") return "user";
  if (kind === "pi.assistant") return "assistant";
  if (kind === "pi.system") return "system";
  if (kind === "pi.tool-result") return "tool";
  return kind;
}

function buildSnapshot(view: ConversationView): Snapshot {
  const entries = view.entries.map(entryToSnapshot);
  const liveDoc = view.docs["pi.live"] as Record<string, unknown> | undefined;

  let live: LiveSnapshot | null = null;
  if (liveDoc) {
    const gen = liveDoc["generation"] as Record<string, unknown> | undefined;
    const tools = (liveDoc["tools"] as Array<Record<string, unknown>> | undefined) ?? [];
    live = {
      generation: gen ? { text: extractGenText(gen) } : null,
      // ToolSlot has callId, not id
      tools: tools.map((t) => ({
        id: String(t["callId"] ?? ""),
        name: String(t["name"] ?? ""),
        output: String(t["output"] ?? ""),
      })),
    };
  }

  const inboxDoc = view.docs["pi.inbox"] as Record<string, unknown> | undefined;
  const inbox: InboxSnapshot[] = [];
  if (inboxDoc) {
    const items = (inboxDoc["items"] as Array<Record<string, unknown>> | undefined) ?? [];
    for (const item of items) {
      inbox.push({
        id: String(item["id"] ?? ""),
        content: extractEntryText(item) ?? "",
        requestId: item["requestId"] ? String(item["requestId"]) : undefined,
      });
    }
  }

  return {
    entries,
    live,
    inbox,
    agent: view.docs["pi.agent"] ?? {},
    usage: view.docs["pi.usage"] ?? {},
  };
}

/**
 * Compute incremental commit ops: only emit entries if the set changed.
 * A pure live-text/tool tick that doesn't change entries produces no commit op.
 */
function diffEntries(prev: ConversationView, next: ConversationView): Op[] {
  const prevIds = prev.entries.map((e) => String(e.id));
  const nextIds = next.entries.map((e) => String(e.id));

  // Fast path: same ids in same order = no entry change
  if (prevIds.length === nextIds.length && prevIds.every((id, i) => id === nextIds[i])) {
    return [];
  }

  return [
    { op: "replace", path: "/entries", value: next.entries.map(entryToSnapshot) },
  ];
}

// ── Source attribution in the bridge ───────────────────────────────────────

function matchContributions(answerText: string, contribs: Contribution[]): string[] {
  if (!answerText || !contribs.length) return [];
  const matched: string[] = [];
  for (const c of contribs) {
    if (
      answerText.includes(c.title) ||
      (c.content.length >= 30 && answerText.includes(c.content.slice(0, 30)))
    ) {
      matched.push(c.id);
    }
  }
  return matched;
}

async function emitSourcesIfNew(
  harness: Harness,
  conversation: Conversation,
  view: ConversationView,
  _ctx: Context,
  send: (msg: ServerMessage) => void,
  sentSourceEntryIds: Set<string>
): Promise<void> {
  // Find assistant entries we haven't processed yet
  const assistantEntries = view.entries.filter((e) => {
    const kind = String((e as unknown as Record<string, unknown>)["kind"] ?? "");
    return kind === "pi.assistant";
  });

  for (const entry of assistantEntries) {
    const entryId = String(entry.id);
    if (sentSourceEntryIds.has(entryId)) continue;
    sentSourceEntryIds.add(entryId);

    // Read contributions and source ledger
    const contribsState = await harness.snapshot(ContributionsDoc, conversation.id, _ctx);
    const contribs = (contribsState?.items ?? []) as unknown as Contribution[];
    if (!contribs.length) continue;

    const answerText = extractEntryText(entry as unknown as Record<string, unknown>) ?? "";
    const matchedIds = matchContributions(answerText, contribs);
    if (!matchedIds.length) continue;

    // Commit to SourceLedgerDoc
    const record: SourceRecord = {
      answerEntryId: entryId,
      contributionIds: matchedIds,
    };
    try {
      await conversation.commit(async (tx) => {
        const doc = await tx.doc(SourceLedgerDoc, conversation.id);
        const ledger = doc as unknown as { records: SourceRecord[] };
        if (!ledger.records) (ledger as Record<string, unknown>)["records"] = [];
        ledger.records.push(record);
      }, _ctx);
    } catch {
      // Non-fatal: source attribution is best-effort
      continue;
    }

    send({ t: "sources", refs: [record] });
  }
}

// ── Bridge per-connection ──────────────────────────────────────────────────

export async function handleClient(
  harness: Harness,
  ws: WebSocket,
  _ctx: Context
): Promise<void> {
  let conversation: Conversation | null = null;
  let prevView: ConversationView | null = null;
  let unsubscribe: (() => void) | null = null;
  // Track which assistant entries we've already emitted sources for
  const sentSourceEntryIds = new Set<string>();

  const send = (msg: ServerMessage) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  const closeView = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    prevView = null;
  };

  ws.on("message", async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      send({ t: "error", message: "Invalid JSON" });
      return;
    }

    try {
      switch (msg.t) {
        case "join": {
          closeView();
          const root = await harness.root(_ctx, {
            agent: {
              instructions:
                "You are a helpful assistant in a shared room. Use list_contributions to see available material. Be concise.",
            },
          });
          conversation = root;

          const view = await root.viewState(_ctx);
          const current = view.value;
          if (current) {
            send({ t: "view", snapshot: buildSnapshot(current) });

            // Seed contributions if empty
            const contribsState = await harness.snapshot(ContributionsDoc, root.id, _ctx);
            const contribs = (contribsState?.items ?? []) as unknown as Contribution[];
            if (!contribs || contribs.length === 0) {
              await seedContributions(harness, root, _ctx);
            }

            // Emit sources for existing answers on join
            sentSourceEntryIds.clear();
            await emitSourcesIfNew(harness, root, current, _ctx, send, sentSourceEntryIds);
            prevView = current;
          }

          const sub = view.subscribe((value: ConversationView) => {
            if (!prevView) {
              prevView = value;
              return;
            }

            const ops = diffEntries(prevView, value);

            // B2: Check for answer deltas from generation.message.content
            const liveDoc = value.docs["pi.live"] as Record<string, unknown> | undefined;
            if (liveDoc) {
              const gen = liveDoc["generation"] as Record<string, unknown> | undefined;
              if (gen) {
                const text = extractGenText(gen);
                const prevLive = prevView.docs["pi.live"] as Record<string, unknown> | undefined;
                const prevGen = prevLive?.["generation"] as Record<string, unknown> | undefined;
                const prevText = prevGen ? extractGenText(prevGen) : "";
                if (text.length > prevText.length) {
                  send({ t: "answer_delta", text: text.slice(prevText.length) });
                }
              }

              // B3: Tool events keyed by callId, not id
              const tools = (liveDoc["tools"] as Array<Record<string, unknown>> | undefined) ?? [];
              const prevLive2 = prevView.docs["pi.live"] as Record<string, unknown> | undefined;
              const prevTools =
                (prevLive2?.["tools"] as Array<Record<string, unknown>> | undefined) ?? [];
              for (let i = 0; i < tools.length; i++) {
                const t = tools[i];
                const pt = prevTools[i];
                const callId = String(t?.["callId"] ?? "");
                const output = String(t?.["output"] ?? "");
                const prevOutput = pt ? String(pt["output"] ?? "") : "";
                // Emit on any new output, including first empty string for pending calls
                if (output !== prevOutput || (output === "" && prevOutput === "" && callId && (!pt || String(pt["callId"] ?? "") !== callId))) {
                  send({
                    t: "tool",
                    id: callId,
                    name: String(t?.["name"] ?? ""),
                    output,
                  });
                }
              }

              // B4: Source attribution — read from SourceLedgerDoc (not view.docs)
              // Emitted on new assistant entries detected
              if (conversation) {
                emitSourcesIfNew(harness, conversation, value, _ctx, send, sentSourceEntryIds);
              }
            }

            if (ops.length > 0) {
              send({ t: "commit", ops });
            }
            prevView = value;
          });

          unsubscribe = () => sub();
          break;
        }

        case "submit": {
          if (!conversation) {
            send({ t: "error", message: "Join a room first" });
            return;
          }
          if (typeof msg.content !== "string" || !msg.content.trim()) {
            send({ t: "error", message: "content must be a non-empty string" });
            return;
          }
          await conversation.submit(
            {
              type: "input",
              content: msg.content,
              requestId: msg.requestId,
              whenBusy: msg.whenBusy ?? "followUp",
            },
            _ctx
          );
          break;
        }

        case "steer": {
          if (!conversation) {
            send({ t: "error", message: "Join a room first" });
            return;
          }
          if (typeof msg.content !== "string" || !msg.content.trim()) {
            send({ t: "error", message: "content must be a non-empty string" });
            return;
          }
          await conversation.submit(
            {
              type: "input",
              content: msg.content,
              whenBusy: "steer",
            },
            _ctx
          );
          break;
        }

        case "interrupt": {
          if (!conversation) {
            send({ t: "error", message: "Join a room first" });
            return;
          }
          await conversation.abort(_ctx);
          break;
        }

        case "fork": {
          if (!conversation) {
            send({ t: "error", message: "Join a room first" });
            return;
          }
          send({
            t: "error",
            message: "Forking is not yet implemented in the POC (out of scope for milestone 1)",
          });
          break;
        }

        case "configure": {
          if (!conversation) {
            send({ t: "error", message: "Join a room first" });
            return;
          }
          send({
            t: "error",
            message: "Tool configuration not implemented in POC milestone 1",
          });
          break;
        }

        case "ping": {
          break;
        }

        default: {
          send({ t: "error", message: `Unknown message type: ${(msg as { t: string }).t}` });
          break;
        }
      }
    } catch (err) {
      send({ t: "error", message: String(err) });
    }
  });

  ws.on("close", () => {
    closeView();
  });

  ws.on("error", () => {
    closeView();
  });
}

// ── Seed contributions ─────────────────────────────────────────────────────

async function seedContributions(
  harness: Harness,
  conversation: Conversation,
  ctx: Context
): Promise<void> {
  const seed: Contribution[] = [
    {
      id: "seed-1",
      title: "Stoa Specification",
      content: "Stoa is a neutral room where people bring knowledge together and question it with an AI, without anyone owning the room.",
      contributor: "system",
      queryableBy: "anyone",
      quoteOnly: false,
      combinable: true,
      expiresAt: null,
    },
    {
      id: "seed-2",
      title: "Pi Durable Engine",
      content: "Pi Durable is a durable agent harness. Conversations, model turns, tool calls, and state are committed to storage before anything is shown.",
      contributor: "system",
      queryableBy: "anyone",
      quoteOnly: true,
      combinable: true,
      expiresAt: null,
    },
  ];

  try {
    await conversation.commit(async (tx) => {
      const doc = await tx.doc(ContributionsDoc, conversation.id);
      const state = doc as unknown as { items: Contribution[] };
      if (!state.items || state.items.length === 0) {
        (state as Record<string, unknown>)["items"] = seed;
      }
    }, ctx);
    console.log("Seeded contributions with", seed.length, "items");
  } catch (err) {
    console.error("Failed to seed contributions:", err);
  }
}
