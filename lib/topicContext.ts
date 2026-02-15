import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Search past conversation summaries for relevance to the current message.
 * Returns formatted context string capped at tokenBudget.
 */
export async function buildTopicContext(
  gatewayId: Id<"gateways">,
  userMessage: string,
  tokenBudget: number = 500
): Promise<string> {
  if (!userMessage.trim()) return "";

  try {
    const related = await convexClient.query(api.functions.conversations.findRelated, {
      gatewayId,
      queryText: userMessage,
      limit: 5,
    });

    if (!related || related.length === 0) return "";

    let context = "\n\n## Related past conversations:\n";
    let tokens = estimateTokens(context);

    for (const convo of related) {
      let entry = "";
      if (convo.title) entry += `**${convo.title}**\n`;
      if (convo.summary) entry += `${convo.summary}\n`;
      if (convo.decisions && convo.decisions.length > 0) {
        entry += "Decisions: " + convo.decisions.map((d: any) => d.what).join("; ") + "\n";
      }
      if (convo.topics && convo.topics.length > 0) {
        entry += `Topics: ${convo.topics.join(", ")}\n`;
      }
      entry += "\n";

      const entryTokens = estimateTokens(entry);
      if (tokens + entryTokens > tokenBudget) break;

      context += entry;
      tokens += entryTokens;
    }

    console.log(`[Context] Layer 4 (Topic context): ${tokens} tokens`);
    return context;
  } catch (err) {
    console.error("Topic context search failed:", err);
    return "";
  }
}
