import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { classifyTopic } from "@/lib/topicClassifier";

/**
 * Post-response hook: runs async after each AI response.
 * Classifies topic shift and manages conversation boundaries.
 */
export async function postResponseHook(
  sessionId: string,
  gatewayId: string
): Promise<void> {
  try {
    // Get last 5 messages by recency
    const recentMessages = await convexClient.query(api.functions.messages.getRecent, {
      sessionId: sessionId as Id<"sessions">,
      limit: 5,
    });

    if (recentMessages.length < 2) return; // Need at least a user+assistant pair

    // Get the latest message seq
    const latestSeq = recentMessages[recentMessages.length - 1]?.seq;
    if (!latestSeq) return;

    // Get active conversation
    const activeConvo = await convexClient.query(api.functions.conversations.getActive, {
      sessionId: sessionId as Id<"sessions">,
    });

    if (!activeConvo) {
      // No active conversation - create one spanning all recent messages
      const firstSeq = recentMessages[0]?.seq ?? 1;
      await convexClient.mutation(api.functions.conversations.create, {
        sessionId: sessionId as Id<"sessions">,
        gatewayId: gatewayId as Id<"gateways">,
        startSeq: firstSeq,
        depth: 1,
      });
      return;
    }

    // Classify topic
    const classification = await classifyTopic(
      recentMessages.map((m: any) => ({ role: m.role, content: m.content })),
      {
        title: activeConvo.title || undefined,
        tags: activeConvo.tags || activeConvo.topics || undefined,
        summary: activeConvo.summary || undefined,
      }
    );

    if (classification.sameTopic) {
      // Same topic - advance endSeq
      await convexClient.mutation(api.functions.conversations.advanceEnd, {
        id: activeConvo._id,
        endSeq: latestSeq,
      });
    } else {
      // Topic shifted - close current, create new
      const closeTags = classification.newTags || activeConvo.tags || activeConvo.topics || [];
      const closeTitle = activeConvo.title || classification.suggestedTitle || "Untitled";

      // Close old conversation
      await convexClient.mutation(api.functions.conversations.close, {
        id: activeConvo._id,
        summary: activeConvo.summary || `Conversation about: ${closeTags.join(", ") || closeTitle}`,
        title: closeTitle,
        tags: closeTags,
        endSeq: latestSeq - 1, // The new message belongs to the new convo
      });

      // Create new conversation with relation to the old one
      const userMsgSeq = recentMessages.find((m: any) => m.role === "user" && m.seq)?.seq ?? latestSeq;
      await convexClient.mutation(api.functions.conversations.create, {
        sessionId: sessionId as Id<"sessions">,
        gatewayId: gatewayId as Id<"gateways">,
        startSeq: userMsgSeq,
        relations: [{
          conversationId: activeConvo._id,
          type: "continuation" as const,
        }],
        depth: 1,
      });
    }
  } catch (err) {
    console.error("[PostResponseHook] Error:", err);
  }
}
