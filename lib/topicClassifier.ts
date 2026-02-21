import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

interface ClassificationResult {
  sameTopic: boolean;
  newTags?: string[];
  suggestedTitle?: string;
}

interface MessageForClassification {
  role: string;
  content: string;
}

interface ConversationContext {
  title?: string;
  tags?: string[];
  summary?: string;
}

// Haiku model IDs per provider
const HAIKU_MODELS: Record<string, string> = {
  anthropic: "claude-3-haiku-20240307",
  openrouter: "anthropic/claude-3-haiku",
  openai: "gpt-4o-mini",
  google: "gemini-2.0-flash",
};

export async function classifyTopic(
  recentMessages: MessageForClassification[],
  currentConversation: ConversationContext | null,
  gatewayId?: string
): Promise<ClassificationResult> {
  try {
    // Use same provider/key as main chat - try gateway config first, fall back to system config
    const getConfig = async (k: string) => {
      if (gatewayId) {
        try {
          const r = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, { gatewayId: gatewayId as any, key: k });
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
    const key = apiKey || process.env.ANTHROPIC_API_KEY || "";
    if (!key) {
      console.warn("[TopicClassifier] No API key, defaulting to sameTopic=true");
      return { sameTopic: true };
    }

    // Set env so pi-ai can find the key
    const envMap: Record<string, string> = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GEMINI_API_KEY",
      openrouter: "OPENROUTER_API_KEY",
    };
    if (envMap[provider]) process.env[envMap[provider]] = key;

    const { registerBuiltInApiProviders, getModel, streamSimple } = await import("@mariozechner/pi-ai");
    registerBuiltInApiProviders();

    const preferredModelId = HAIKU_MODELS[provider] || HAIKU_MODELS.anthropic;
    let resolvedModelId = preferredModelId;
    let model = getModel(provider as any, preferredModelId as any);
    if (!model && configuredModel) {
      model = getModel(provider as any, configuredModel as any);
      if (model) resolvedModelId = configuredModel;
    }
    if (!model) {
      console.error(`[TopicClassifier] No classifier model found for provider "${provider}" (tried "${preferredModelId}"${configuredModel ? `, "${configuredModel}"` : ""})`);
      return { sameTopic: true };
    }

    const convoContext = currentConversation
      ? `Current conversation: title="${currentConversation.title || "untitled"}", tags=[${(currentConversation.tags || []).join(", ")}], summary="${currentConversation.summary || "none"}"`
      : "No current conversation context.";

    const messagesText = recentMessages
      .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
      .join("\n");

    const context = {
      systemPrompt: `You are a conservative topic classifier. You must determine if a conversation has COMPLETELY changed to an unrelated subject.

IMPORTANT RULES:
- "sameTopic": true means the conversation is still about the same general subject, even if the angle or sub-topic changed
- Only set "sameTopic": false when the user has COMPLETELY abandoned the previous subject and started discussing something ENTIRELY DIFFERENT
- Follow-up questions, clarifications, related tangents, and deeper dives into the same subject are ALL the same topic
- "I want coffee" followed by "I just want caffeine" = SAME TOPIC (both about beverages/drinks)
- "Tell me about Python" followed by "What about TypeScript?" = SAME TOPIC (both about programming)
- "How do I cook pasta?" followed by "What's the best telescope?" = DIFFERENT TOPIC

Respond with JSON only, no markdown: { "sameTopic": boolean, "newTags": string[], "suggestedTitle": string }`,
      messages: [
        {
          role: "user" as const,
          content: `${convoContext}\n\nRecent messages:\n${messagesText}\n\nIs the LATEST message still part of the same general conversation topic? Only say sameTopic:false if it's a COMPLETELY unrelated subject. Respond with JSON only.`,
          timestamp: Date.now(),
        },
      ],
    };

    let result = "";
    const stream = streamSimple(model, context, { maxTokens: 256, apiKey: key });
    for await (const event of stream) {
      if (event.type === "text_delta") {
        result += event.delta;
      }
    }

    console.log(`[TopicClassifier] Provider: ${provider}, Model: ${resolvedModelId}, Result: ${result.slice(0, 200)}`);

    // Parse JSON from response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        sameTopic: parsed.sameTopic ?? true,
        newTags: parsed.newTags,
        suggestedTitle: parsed.suggestedTitle,
      };
    }

    return { sameTopic: true };
  } catch (err) {
    console.error("[TopicClassifier] Error:", err);
    return { sameTopic: true };
  }
}
