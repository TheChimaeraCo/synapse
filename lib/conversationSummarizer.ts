import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const SUMMARY_PROMPT = `Analyze this conversation and provide a JSON response with:
- "title": A short title (under 60 chars)
- "summary": A 2-3 sentence summary of what was discussed
- "topics": Array of topic keywords (3-7 items)
- "decisions": Array of decisions made, each with "what" (the decision) and optional "reasoning"

Respond ONLY with valid JSON, no markdown.`;

/**
 * Summarize a conversation using AI. Called when a conversation closes.
 * For MVP this is fire-and-forget - failures are logged but don't block.
 */
export async function summarizeConversation(
  conversationId: Id<"conversations">
): Promise<void> {
  try {
    const convo = await convexClient.query(api.functions.conversations.get, { id: conversationId });
    if (!convo || convo.status !== "closed") return;
    if (convo.summary) return; // Already summarized

    // Get messages for this conversation
    // Since messages may not all have conversationId yet, get recent from session
    const messages = await convexClient.query(api.functions.messages.getRecent, {
      sessionId: convo.sessionId,
      limit: Math.min(convo.messageCount + 5, 30),
    });

    if (messages.length < 2) {
      // Too few messages, just set a basic title
      const firstMsg = messages[0];
      await convexClient.mutation(api.functions.conversations.close, {
        id: conversationId,
        title: firstMsg?.content?.slice(0, 50) || "Brief exchange",
        summary: "Short conversation.",
        topics: [],
      });
      return;
    }

    // Format messages for summarization
    const formatted = messages
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n\n");

    // Use AI to summarize
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      console.error("[conversationSummarizer] No API key, skipping summarization");
      return;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-3-20250514",
        max_tokens: 500,
        messages: [
          { role: "user", content: `${SUMMARY_PROMPT}\n\n---\n\n${formatted}` },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[conversationSummarizer] API error:", response.status);
      return;
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";

    // Parse JSON response
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Try to extract JSON from response
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        console.error("[conversationSummarizer] Failed to parse AI response");
        return;
      }
    }

    await convexClient.mutation(api.functions.conversations.close, {
      id: conversationId,
      title: parsed.title || undefined,
      summary: parsed.summary || undefined,
      topics: Array.isArray(parsed.topics) ? parsed.topics : undefined,
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : undefined,
    });
  } catch (err) {
    console.error("[conversationSummarizer] Error:", err);
  }
}
