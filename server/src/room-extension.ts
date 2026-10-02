import { defineDoc, defineExtension, defineTool, hook, GenerationTask } from "@earendil-works/pi-durable";
import type { HookApi } from "@earendil-works/pi-durable";
import type { Context, JsonValue } from "@earendil-works/chord";
import { Type } from "@earendil-works/pi-ai";
import { log, extractStopReason } from "./log.js";

// ── Document types ─────────────────────────────────────────────────────────

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

export interface ContributionsState {
  items: Contribution[];
  [key: string]: JsonValue;
}

export interface SourceRecord {
  answerEntryId: string;
  contributionIds: string[];
  [key: string]: JsonValue;
}

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

// ── Hook: source-attribution memo ──────────────────────────────────────────

/**
 * afterResponse hook: scan the assistant's answer text for contribution content
 * matches and store them in a task-scoped memo. The bridge picks up the memo
 * and commits matched sources to the SourceLedgerDoc (since custom conversation
 * docs are not mounted in ConversationView.docs).
 */
const sourceAttributionHook = hook(GenerationTask, {
  afterResponse: async (message, api: HookApi, _context: Context) => {
    // ── INSTRUMENTATION: provider result as seen at the stoa hook seam ──
    // (coarsest provider-result seam available without reading pi-ai internals)
    const answerText = extractTextFromMessage(message) ?? "";
    log("res-hook", null, `assistantLen=${answerText.length} empty=${answerText.trim().length === 0} stopReason=${extractStopReason(message)}`);
    const state = await api.snapshot(ContributionsDoc, api.conversationId, _context);
    const contribs = (state?.items ?? []) as unknown as Contribution[];
    if (!contribs || contribs.length === 0) return;

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

    // Store in a durable memo so the bridge can pick it up.
    // The bridge commits to SourceLedgerDoc separately.
    const msgId = (message as unknown as Record<string, unknown>)["id"];
    await api.memo("pendingSources", {
      answerEntryId: String(msgId ?? ""),
      contributionIds: matchedIds,
    }, _context);
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
  const m = message as unknown as Record<string, unknown>;
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
