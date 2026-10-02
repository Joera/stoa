import { defineDoc, defineExtension, defineTool, hook, GenerationTask, ToolTask } from "@earendil-works/pi-durable";
import type { HookApi } from "@earendil-works/pi-durable";
import type { Context, JsonValue } from "@earendil-works/chord";
import { Type } from "@earendil-works/pi-ai";

// ── Document types ─────────────────────────────────────────────────────────

/** One contribution in the room. */
export interface Contribution {
  id: string;
  title: string;
  content: string;
  contributor: string;
  queryableBy: "anyone" | "listed";
  quoteOnly: boolean;
  combinable: boolean;
  expiresAt: string | null;
  [key: string]: JsonValue;
}

/** Wrapper for the room's contribution list. */
export interface ContributionsState {
  items: Contribution[];
  [key: string]: JsonValue;
}

/** Per-answer source ledger entry. */
export interface SourceRecord {
  answerEntryId: string;
  contributionIds: string[];
  [key: string]: JsonValue;
}

/** Wrapper for per-answer source records. */
export interface SourceLedgerState {
  records: SourceRecord[];
  [key: string]: JsonValue;
}

// ── Documents ──────────────────────────────────────────────────────────────

export const ContributionsDoc = defineDoc<ContributionsState>({
  kind: "room.contributions",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ items: [] }),
});

export const SourceLedgerDoc = defineDoc<SourceLedgerState>({
  kind: "room.source-ledger",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ records: [] }),
});

// ── Tool ───────────────────────────────────────────────────────────────────

export const listContributionsTool = defineTool({
  name: "list_contributions",
  description: "List all contributions available in this room.",
  parameters: Type.Object({}),
  execute: async (_args, api, context) => {
    const state = await api.snapshot(ContributionsDoc, api.conversationId, context);
    const now = new Date().toISOString();
    const contribs = (state?.items ?? []) as unknown as Contribution[];
    const active = contribs.filter(
      (c) => !c.expiresAt || c.expiresAt > now
    );
    api.output(JSON.stringify(active, null, 2));
    return {};
  },
});

// ── Hooks ──────────────────────────────────────────────────────────────────

const sourceAttributionHook = hook(GenerationTask, {
  afterResponse: async (message, api: HookApi, context: Context) => {
    const state = await api.snapshot(ContributionsDoc, api.conversationId, context);
    const contribs = (state?.items ?? []) as unknown as Contribution[];
    if (!contribs || contribs.length === 0) return;

    const answerText = extractTextFromMessage(message);
    if (!answerText) return;

    const matchedIds: string[] = [];
    for (const c of contribs) {
      if (
        answerText.includes(c.title) ||
        (c.content.length >= 30 && answerText.includes(c.content.slice(0, 30)))
      ) {
        matchedIds.push(c.id);
      }
    }

    if (matchedIds.length === 0) return;

    // Record pending sources via memo
    const msgId = (message as unknown as Record<string, unknown>)["id"];
    await api.memo("pendingSources", {
      answerEntryId: String(msgId ?? ""),
      contributionIds: matchedIds,
    }, context);
  },
});

// ── Extension ──────────────────────────────────────────────────────────────

export const RoomExtension = defineExtension({
  name: "room",
  tools: [listContributionsTool],
  hooks: [sourceAttributionHook],
});

// ── Helpers ────────────────────────────────────────────────────────────────

function extractTextFromMessage(message: unknown): string | undefined {
  if (message == null) return undefined;
  const m = message as Record<string, unknown>;
  const content = m["content"];
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as Array<{ type: string; text?: string }>)
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");
  }
  return undefined;
}
