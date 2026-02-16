import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const SUMMARY_PROMPT = `Analyze this conversation and provide a JSON response with:
- "title": A short, natural title (under 60 chars) - like how you'd describe this chat to a friend
- "summary": A 2-3 sentence summary focused on: what the user wanted, what was discussed, and what the outcome was. Write it as if you're reminding yourself what happened - e.g. "User asked about X. We worked through Y and decided Z." NOT a formal abstract.
- "topics": Array of topic keywords (3-7 items)
- "decisions": Array of decisions made, each with "what" (the decision) and optional "reasoning"
- "userFacts": Array of facts learned about the user during this conversation (e.g. "prefers dark mode", "works on a Next.js project", "lives in Austin"). Only include things explicitly stated or clearly implied. Empty array if nothing new learned.

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

    // Use AI to summarize via pi-ai (same as main chat/classifier)
    const getConfig = async (k: string) => {
      if (convo.gatewayId) {
        try {
          const r = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, { gatewayId: convo.gatewayId, key: k });
          if (r?.value) return r.value;
        } catch {}
      }
      return await convexClient.query(api.functions.config.get, { key: k });
    };

    const [providerSlug, apiKey] = await Promise.all([
      getConfig("ai_provider"),
      getConfig("ai_api_key"),
    ]);
    const provider = providerSlug || "anthropic";
    const key = apiKey || process.env.ANTHROPIC_API_KEY || "";
    if (!key) {
      console.error("[conversationSummarizer] No API key, skipping summarization");
      return;
    }

    const envMap: Record<string, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", google: "GEMINI_API_KEY", openrouter: "OPENROUTER_API_KEY" };
    if (envMap[provider]) process.env[envMap[provider]] = key;

    const { registerBuiltInApiProviders, getModel, streamSimple } = await import("@mariozechner/pi-ai");
    registerBuiltInApiProviders();
    const model = getModel(provider as any, "claude-3-haiku-20240307" as any);
    if (!model) {
      console.error("[conversationSummarizer] Model not found");
      return;
    }

    let text = "";
    const aiStream = streamSimple(model, {
      systemPrompt: "",
      messages: [{ role: "user", content: `${SUMMARY_PROMPT}\n\n---\n\n${formatted}`, timestamp: Date.now() }],
    }, { maxTokens: 500, apiKey: key });
    for await (const event of aiStream) {
      if (event.type === "text_delta") text += event.delta;
    }

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

    // Store any learned user facts as knowledge entries
    if (Array.isArray(parsed.userFacts) && parsed.userFacts.length > 0 && convo.gatewayId) {
      try {
        // Look up the agent for this gateway
        const agents = await convexClient.query(api.functions.agents.list, { gatewayId: convo.gatewayId });
        const agent = agents?.[0];
        if (agent) {
          for (const fact of parsed.userFacts.slice(0, 5)) { // cap at 5 facts per conversation
            if (typeof fact === "string" && fact.trim()) {
              await convexClient.mutation(api.functions.knowledge.upsert, {
                agentId: agent._id,
                userId: convo.userId || undefined,
                category: "learned",
                key: fact.trim().slice(0, 100),
                value: fact.trim(),
                source: "conversation",
                confidence: 0.7,
              });
            }
          }
          console.log(`[conversationSummarizer] Stored ${Math.min(parsed.userFacts.length, 5)} user facts as knowledge`);
        }
      } catch (err) {
        console.error("[conversationSummarizer] Failed to store user facts:", err);
      }
    }
  } catch (err) {
    console.error("[conversationSummarizer] Error:", err);
  }
}
