import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const REFLECTION_PROMPT = `You are reflecting on a conversation you just had. Extract insights about your human - not facts (those go to knowledge), but behavioral patterns, relationship dynamics, and personality observations.

Categories:
- communication_pattern: How they communicate (short messages, uses emojis, code-switches between casual/technical)
- relationship_dynamic: How you two interact (inside jokes, trust level, banter style)
- preference: What they prefer in YOUR behavior (brief answers, show work, match energy)
- emotional_intelligence: Emotional patterns you noticed (gets quiet when stressed, excited about wins)
- inside_joke: Shared references, recurring themes, or humor patterns between you two
- behavioral_adaptation: How you should adapt your behavior based on what you learned

Output a JSON array: [{"category": "...", "insight": "..."}]
Only include genuinely new or reinforced observations. Skip obvious/generic things.
Be specific and actionable. "They like short answers" is better than "They have preferences."
If nothing notable was observed, return an empty array: []
Respond ONLY with valid JSON, no markdown fences.`;

/**
 * Reflect on a conversation and extract soul evolution insights.
 * Fire-and-forget - errors are logged but don't block.
 */
export async function reflectOnConversation(
  conversationId: Id<"conversations">,
  gatewayId: Id<"gateways">
): Promise<void> {
  try {
    const convo = await convexClient.query(api.functions.conversations.get, { id: conversationId });
    if (!convo) return;

    // Get messages for this conversation
    let messages: Array<{ role: string; content: string }> = [];
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
    }

    messages = messages.filter((m) => m.role === "user" || m.role === "assistant");
    if (messages.length < 3) return; // Too few messages to reflect on

    // Get agent
    const agents = await convexClient.query(api.functions.agents.list, { gatewayId });
    const agent = agents?.[0];
    if (!agent) return;

    // Format messages
    const formatted = messages
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n\n");

    // Get AI config (same pattern as conversationSummarizer)
    const getConfig = async (k: string) => {
      try {
        const r = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, { gatewayId, key: k });
        if (r?.value) return r.value;
      } catch {}
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
      console.error("[soulReflection] No API key, skipping");
      return;
    }
    hydrateProviderEnv(provider, key);

    const { registerBuiltInApiProviders, getModel, streamSimple } = await import("@mariozechner/pi-ai");
    registerBuiltInApiProviders();

    const REFLECTION_MODELS: Record<string, string> = {
      anthropic: "claude-3-haiku-20240307",
      openrouter: "anthropic/claude-3-haiku",
      openai: "gpt-4o-mini",
      google: "gemini-2.0-flash",
    };

    const preferredModelId = REFLECTION_MODELS[provider] || REFLECTION_MODELS.anthropic;
    let model = getModel(provider as any, preferredModelId as any);
    if (!model && configuredModel) {
      model = getModel(provider as any, configuredModel as any);
    }
    if (!model) {
      console.error("[soulReflection] No model found");
      return;
    }

    let text = "";
    const aiStream = streamSimple(model, {
      systemPrompt: "",
      messages: [{ role: "user", content: `${REFLECTION_PROMPT}\n\n---\n\n${formatted}`, timestamp: Date.now() }],
    }, { maxTokens: 500, apiKey: key });
    for await (const event of aiStream) {
      if (event.type === "text_delta") text += event.delta;
    }

    // Parse JSON response
    let insights: Array<{ category: string; insight: string }>;
    try {
      insights = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        insights = JSON.parse(match[0]);
      } else {
        console.error("[soulReflection] Failed to parse AI response:", text.slice(0, 200));
        return;
      }
    }

    if (!Array.isArray(insights) || insights.length === 0) return;

    // Store insights via the reflect mutation
    const result = await convexClient.mutation(api.functions.soulEvolution.reflect, {
      agentId: agent._id,
      gatewayId,
      insights: insights.slice(0, 10), // Cap at 10 per reflection
      sourceConversationId: conversationId,
    });

    console.log(`[soulReflection] Stored ${result.stored} insights from conversation ${conversationId}`);
  } catch (err) {
    console.error("[soulReflection] Error:", err);
  }
}
