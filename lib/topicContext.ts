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

    let context = "\n\n## What you've previously discussed with this user:\n";
    let tokens = estimateTokens(context);

    for (const convo of related) {
      let entry = "";
      // Format naturally - like recalling a memory, not a data dump
      if (convo.title && convo.summary) {
        entry += `- You previously talked about "${convo.title}": ${convo.summary}\n`;
      } else if (convo.summary) {
        entry += `- In an earlier conversation: ${convo.summary}\n`;
      } else if (convo.title) {
        entry += `- You previously discussed "${convo.title}"\n`;
      }
      if (convo.decisions && convo.decisions.length > 0) {
        entry += "  Decisions made: " + convo.decisions.map((d: any) => d.what).join("; ") + "\n";
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
