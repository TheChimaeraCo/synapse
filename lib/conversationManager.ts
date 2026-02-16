import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { classifyTopic } from "@/lib/topicClassifier";
import { summarizeConversation } from "@/lib/conversationSummarizer";

const CONVERSATION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours - safety net only, AI handles topic shifts via new_conversation tool
const CLASSIFY_EVERY_N_MESSAGES = 6; // Run AI topic classification after N messages (conservative)

/**
 * Resolve the current conversation for a message.
 * Creates a new conversation if needed, or continues the active one.
 * Chains related conversations together.
 */
export async function resolveConversation(
  sessionId: Id<"sessions">,
  gatewayId: Id<"gateways">,
  userId: Id<"authUsers"> | undefined,
  newMessage: string
): Promise<Id<"conversations">> {
  const activeConvo = await convexClient.query(api.functions.conversations.getActive, { sessionId });

  if (!activeConvo) {
    // First message - create new conversation
    return await convexClient.mutation(api.functions.conversations.create, {
      sessionId,
      gatewayId,
      userId,
      depth: 1,
    });
  }

  // Check time gap
  const gap = Date.now() - activeConvo.lastMessageAt;

  // Check if user explicitly wants a new conversation
  const wantsNew = detectNewConversationIntent(newMessage);

  // Determine if we should run AI topic classification
  let topicShifted = false;
  let classificationResult: { sameTopic: boolean; suggestedTitle?: string; newTags?: string[] } | null = null;
  const nextCount = activeConvo.messageCount + 1;
  const shouldClassify = nextCount >= CLASSIFY_EVERY_N_MESSAGES && (nextCount - CLASSIFY_EVERY_N_MESSAGES) % 3 === 0;
  console.log(`[ConvoSegmentation] Message ${nextCount} in conversation, shouldClassify: ${shouldClassify}`);
  if (!wantsNew && gap < CONVERSATION_TIMEOUT_MS && shouldClassify) {
    try {
      // Get recent messages for classification + include the new incoming message
      const recentMsgs = await convexClient.query(api.functions.messages.listByConversation, {
        conversationId: activeConvo._id,
        limit: 10,
      });
      const msgsForClassification = [
        ...recentMsgs.map((m: any) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: newMessage },
      ];
      const classification = await classifyTopic(
        msgsForClassification,
        { title: activeConvo.title, tags: activeConvo.tags, summary: activeConvo.summary },
        gatewayId as string
      );
      classificationResult = classification;
      topicShifted = !classification.sameTopic;
      if (topicShifted) {
        console.log(`[ConvoSegmentation] AI detected topic shift after ${activeConvo.messageCount} messages. New topic: ${classification.suggestedTitle || "unknown"}`);
      } else if (!activeConvo.title && classification.suggestedTitle) {
        // Same topic but conversation has no title yet - update it
        try {
          await convexClient.mutation(api.functions.conversations.update, {
            id: activeConvo._id,
            ...(classification.suggestedTitle ? { title: classification.suggestedTitle } : {}),
            ...(classification.newTags?.length ? { tags: classification.newTags } : {}),
          });
          console.log(`[ConvoSegmentation] Updated conversation title: "${classification.suggestedTitle}"`);
        } catch (err) {
          console.error("[ConvoSegmentation] Failed to update conversation title:", err);
        }
      }
    } catch (err) {
      console.error("[ConvoSegmentation] Topic classification failed, continuing same convo:", err);
    }
  }

  // Under timeout AND no explicit intent AND no topic shift - same conversation
  if (gap < CONVERSATION_TIMEOUT_MS && !wantsNew && !topicShifted) {
    await convexClient.mutation(api.functions.conversations.updateMessageCount, { id: activeConvo._id });
    return activeConvo._id;
  }

  // Topic shift, timeout, or explicit intent - close and create new conversation
  // Always chain conversations in the same session (they share context history)
  const isRelated = gap < CONVERSATION_TIMEOUT_MS;

  // Close the old conversation
  await convexClient.mutation(api.functions.conversations.close, {
    id: activeConvo._id,
  });

  // Fire-and-forget summarization of the closed conversation
  summarizeConversation(activeConvo._id).catch((err) =>
    console.error("[ConvoSegmentation] Summarization failed:", err)
  );

  // Create new one, chain if related
  const newConvoId = await convexClient.mutation(api.functions.conversations.create, {
    sessionId,
    gatewayId,
    userId,
    previousConvoId: isRelated ? activeConvo._id : undefined,
    depth: isRelated ? activeConvo.depth + 1 : 1,
    ...(classificationResult?.suggestedTitle ? { title: classificationResult.suggestedTitle } : {}),
    ...(classificationResult?.newTags?.length ? { tags: classificationResult.newTags } : {}),
  });

  return newConvoId;
}

/**
 * Detect if the user explicitly wants to start a new conversation.
 */
export function detectNewConversationIntent(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const patterns = [
    /new (conversation|convo|topic|subject|chat)/,
    /move on/,
    /change (the )?(subject|topic)/,
    /let'?s talk about something else/,
    /start (a )?(new|fresh)/,
    /different (topic|subject)/,
    /anyway[,.]?\s/,  // "Anyway, ..." as topic shift (only if followed by more text)
    /^(ok|okay|alright|so)\s*,?\s*(new topic|next|moving on)/i,
  ];
  return patterns.some((p) => p.test(lower));
}

/**
 * Simple keyword overlap check for MVP.
 * Returns true if there are at least 2 significant words in common.
 */
export function checkTopicRelation(previousSummary: string, newMessage: string): boolean {
  const prevWords = new Set(
    previousSummary.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  );
  if (prevWords.size === 0) return false;

  const newWords = newMessage.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const overlap = newWords.filter((w) => prevWords.has(w)).length;
  return overlap >= 2;
}

/**
 * Build conversation chain context for the system prompt.
 * Returns formatted string with previous conversation summaries.
 */
export async function buildConversationChainContext(
  conversationId: Id<"conversations">
): Promise<string> {
  const chain = await convexClient.query(api.functions.conversations.getChain, {
    conversationId,
    maxDepth: 5,
  });

  if (chain.length <= 1) return "";

  // Skip the current conversation (first in chain), format the rest
  const previousConvos = chain.slice(1);
  if (previousConvos.length === 0) return "";

  let context = "\n\n## Previous related conversations:\n";
  for (const convo of previousConvos) {
    if (!convo.summary && !convo.title) continue;
    context += `\n### ${convo.title || "Untitled conversation"}\n`;
    if (convo.summary) context += `${convo.summary}\n`;
    if (convo.decisions && convo.decisions.length > 0) {
      context += "Decisions made:\n";
      for (const d of convo.decisions) {
        context += `- ${d.what}${d.reasoning ? ` (${d.reasoning})` : ""}\n`;
      }
    }
    if (convo.topics && convo.topics.length > 0) {
      context += `Topics: ${convo.topics.join(", ")}\n`;
    }
  }

  return context;
}
