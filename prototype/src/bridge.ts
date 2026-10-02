import type { Context } from "@earendil-works/chord";
import type { Conversation, ConversationView, Harness, EntryRecord } from "@earendil-works/pi-durable";
import type { WebSocket } from "ws";

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

// ── Helpers ────────────────────────────────────────────────────────────────

function entryToSnapshot(e: EntryRecord): EntrySnapshot {
  const raw = e as unknown as Record<string, unknown>;
  const kind = String(raw["kind"] ?? "");
  return {
    id: String(raw["id"] ?? ""),
    kind,
    role: kindToRole(kind),
    content: extractEntryContent(raw) ?? "",
  };
}

function kindToRole(kind: string): string {
  if (kind === "pi.user") return "user";
  if (kind === "pi.assistant") return "assistant";
  if (kind === "pi.system") return "system";
  if (kind === "pi.tool-result") return "tool";
  return kind;
}

function extractEntryContent(raw: Record<string, unknown>): string | undefined {
  const content = raw["content"];
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as Array<{ type: string; text?: string }>)
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");
  }
  return undefined;
}

function buildSnapshot(view: ConversationView): Snapshot {
  const entries = view.entries.map(entryToSnapshot);
  const liveDoc = view.docs["pi.live"] as Record<string, unknown> | undefined;

  let live: LiveSnapshot | null = null;
  if (liveDoc) {
    const gen = liveDoc["generation"] as Record<string, unknown> | undefined;
    const tools = (liveDoc["tools"] as Array<Record<string, unknown>> | undefined) ?? [];
    live = {
      generation: gen ? { text: String(gen["text"] ?? "") } : null,
      tools: tools.map((t) => ({
        id: String(t["id"] ?? ""),
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
        content: extractEntryContent(item) ?? "",
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

function diffView(_prev: ConversationView, next: ConversationView): Op[] {
  const snapshot = buildSnapshot(next);
  return [{ op: "replace", path: "/entries", value: snapshot.entries }];
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
            prevView = current;
          }

          const sub = view.subscribe((value: ConversationView) => {
            if (!prevView) {
              prevView = value;
              return;
            }

            const ops = diffView(prevView, value);

            // Check for answer deltas
            const liveDoc = value.docs["pi.live"] as Record<string, unknown> | undefined;
            if (liveDoc) {
              const gen = liveDoc["generation"] as Record<string, unknown> | undefined;
              if (gen) {
                const text = String(gen["text"] ?? "");
                const prevLive = prevView.docs["pi.live"] as Record<string, unknown> | undefined;
                const prevGen = prevLive?.["generation"] as Record<string, unknown> | undefined;
                const prevText = prevGen ? String(prevGen["text"] ?? "") : "";
                if (text.length > prevText.length) {
                  send({ t: "answer_delta", text: text.slice(prevText.length) });
                }
              }

              // Check for tool updates
              const tools = (liveDoc["tools"] as Array<Record<string, unknown>> | undefined) ?? [];
              const prevLive2 = prevView.docs["pi.live"] as Record<string, unknown> | undefined;
              const prevTools =
                (prevLive2?.["tools"] as Array<Record<string, unknown>> | undefined) ?? [];
              for (let i = 0; i < tools.length; i++) {
                const t = tools[i];
                const pt = prevTools[i];
                const output = String(t?.["output"] ?? "");
                const prevOutput = pt ? String(pt["output"] ?? "") : "";
                if (output !== prevOutput) {
                  send({
                    t: "tool",
                    id: String(t?.["id"] ?? ""),
                    name: String(t?.["name"] ?? ""),
                    output,
                  });
                }
              }

              // Source ledger changes
              const ledger = value.docs["room.source-ledger"] as unknown as
                | { records: SourceRef[] }
                | undefined;
              const prevLedger = prevView.docs["room.source-ledger"] as unknown as
                | { records: SourceRef[] }
                | undefined;
              if (ledger && (!prevLedger || ledger.records.length > prevLedger.records.length)) {
                const newRecords = prevLedger
                  ? ledger.records.slice(prevLedger.records.length)
                  : ledger.records;
                for (const rec of newRecords) {
                  send({ t: "sources", refs: [rec] });
                }
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
          if (msg.tools) {
            send({
              t: "error",
              message: "Tool configuration not implemented in POC milestone 1",
            });
          }
          break;
        }

        case "ping": {
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
