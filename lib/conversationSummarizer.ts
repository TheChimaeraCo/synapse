import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const SUMMARY_MODELS: Record<string, string> = {
  anthropic: "claude-3-haiku-20240307",
  openrouter: "anthropic/claude-3-haiku",
  openai: "gpt-4o-mini",
  google: "gemini-2.0-flash",
};

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

    // Get messages for this exact conversation segment.
    // Prefer seq range because it's stable even for old rows missing conversationId.
    let messages: Array<{ role: string; content: string; seq?: number; conversationId?: Id<"conversations"> }> = [];
    if (
      typeof convo.startSeq === "number" &&
      typeof convo.endSeq === "number" &&
      convo.endSeq >= convo.startSeq
    ) {
      messages = await convexClient.query(api.functions.messages.getBySeqRange, {
        sessionId: convo.sessionId,
        startSeq: convo.startSeq,
        endSeq: convo.endSeq,
      });
    } else {
      messages = await convexClient.query(api.functions.messages.listByConversation, {
        conversationId,
        limit: 200,
      }) as any;

      if (messages.length === 0) {
        // Last-resort fallback for legacy rows
        const recent = await convexClient.query(api.functions.messages.getRecent, {
          sessionId: convo.sessionId,
          limit: 80,
        });
        messages = recent.filter((m: any) => m.conversationId === conversationId);
      }
    }

    messages = messages.filter((m) => m.role === "user" || m.role === "assistant");

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

    const [providerSlug, apiKey, configuredModel] = await Promise.all([
      getConfig("ai_provider"),
      getConfig("ai_api_key"),
      getConfig("ai_model"),
    ]);
    const provider = providerSlug || "anthropic";
    const { getProviderApiKey, hydrateProviderEnv } = await import("./providerSecrets");
    const key = apiKey || getProviderApiKey(provider) || "";
    if (!key) {
      console.error("[conversationSummarizer] No API key, skipping summarization");
      return;
    }
    hydrateProviderEnv(provider, key);

    const { registerBuiltInApiProviders, getModel, streamSimple } = await import("@mariozechner/pi-ai");
    registerBuiltInApiProviders();
    const preferredModelId = SUMMARY_MODELS[provider] || SUMMARY_MODELS.anthropic;
    let resolvedModelId = preferredModelId;
    let model = getModel(provider as any, preferredModelId as any);
    if (!model && configuredModel) {
      model = getModel(provider as any, configuredModel as any);
      if (model) resolvedModelId = configuredModel;
    }
    if (!model) {
      console.error(`[conversationSummarizer] No summary model found (tried "${preferredModelId}"${configuredModel ? `, "${configuredModel}"` : ""})`);
      return;
    }
    console.log(`[conversationSummarizer] Using ${provider}:${resolvedModelId}`);

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

    const topics = Array.isArray(parsed.topics)
      ? parsed.topics.filter((t: any) => typeof t === "string" && t.trim()).map((t: string) => t.trim()).slice(0, 10)
      : undefined;

    await convexClient.mutation(api.functions.conversations.close, {
      id: conversationId,
      title: parsed.title || undefined,
      summary: parsed.summary || undefined,
      topics,
      tags: topics?.slice(0, 7),
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
                gatewayId: convo.gatewayId,
                userId: convo.userId ? String(convo.userId) : undefined,
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
