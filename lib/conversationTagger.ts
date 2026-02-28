import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { classifyTopic } from "@/lib/topicClassifier";

type QueueInput = {
  gatewayId: Id<"gateways">;
  conversationId?: Id<"conversations">;
  userMessageId?: Id<"messages">;
};

const inflight = new Set<string>();

function mergeTags(existing: string[] | undefined, incoming: string[] | undefined): string[] {
  const out = new Set<string>();
  for (const tag of existing || []) {
    const t = String(tag || "").trim();
    if (t) out.add(t);
  }
  for (const tag of incoming || []) {
    const t = String(tag || "").trim();
    if (t) out.add(t);
  }
  return Array.from(out).slice(0, 10);
}

export function queueConversationTagger(input: QueueInput): void {
  if (!input.conversationId) return;
  const key = `${String(input.conversationId)}:${String(input.userMessageId || "")}`;
  if (inflight.has(key)) return;
  inflight.add(key);

  setTimeout(() => {
    runConversationTagger(input)
      .catch((err) => console.error("[ConversationTagger] Failed:", err))
      .finally(() => inflight.delete(key));
  }, 0);
}

async function runConversationTagger(input: QueueInput): Promise<void> {
  if (!input.conversationId) return;

  const convo = await convexClient.query(api.functions.conversations.get, {
    id: input.conversationId,
  });
  if (!convo || convo.status !== "active") return;

  const recent = await convexClient.query(api.functions.messages.listByConversation, {
    conversationId: input.conversationId,
    limit: 14,
  });
  if (recent.length < 2) return;

  const classification = await classifyTopic(
    recent.map((m: any) => ({ role: m.role, content: m.content })),
    {
      title: convo.title || undefined,
      tags: convo.tags || convo.topics || undefined,
      summary: convo.summary || undefined,
    },
    String(input.gatewayId)
  );

  const nextTags = mergeTags(convo.tags, classification.newTags);
  const shouldSetTitle = (!convo.title || convo.title === "Untitled") && !!classification.suggestedTitle;
  const tagsChanged = JSON.stringify(nextTags) !== JSON.stringify(convo.tags || []);

  if (shouldSetTitle || tagsChanged) {
    await convexClient.mutation(api.functions.conversations.update, {
      id: input.conversationId,
      ...(shouldSetTitle ? { title: classification.suggestedTitle } : {}),
      ...(tagsChanged ? { tags: nextTags } : {}),
    });
  }

  if (!input.userMessageId) return;
  const msg = await convexClient.query(api.functions.messages.get, { id: input.userMessageId });
  if (!msg || msg.role !== "user") return;

  const existingMeta =
    msg.metadata && typeof msg.metadata === "object" && !Array.isArray(msg.metadata)
      ? msg.metadata
      : {};
  const existingSeg =
    existingMeta.segmentation && typeof existingMeta.segmentation === "object"
      ? existingMeta.segmentation
      : {};
  const asyncScore = Math.max(
    1,
    Math.min(
      100,
      Math.round(
        classification.relevanceScore !== undefined
          ? classification.relevanceScore
          : (classification.sameTopic ? 70 : 20)
      )
    )
  );

  await convexClient.mutation(api.functions.messages.update, {
    id: input.userMessageId,
    metadata: {
      ...existingMeta,
      segmentation: {
        ...existingSeg,
        asyncRelevanceScore: asyncScore,
        asyncClassifier: true,
        asyncTaggedAt: Date.now(),
      },
    },
  });
}
