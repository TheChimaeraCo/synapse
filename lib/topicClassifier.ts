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
  currentConversation: ConversationContext | null
): Promise<ClassificationResult> {
  try {
    // Use same provider/key as main chat
    const [providerSlug, apiKey] = await Promise.all([
      convexClient.query(api.functions.config.get, { key: "ai_provider" }),
      convexClient.query(api.functions.config.get, { key: "ai_api_key" }),
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

    const modelId = HAIKU_MODELS[provider] || HAIKU_MODELS.anthropic;
    const model = getModel(provider as any, modelId as any);
    if (!model) {
      console.error(`[TopicClassifier] Model "${modelId}" not found for provider "${provider}"`);
      return { sameTopic: true };
    }

    const convoContext = currentConversation
      ? `Current conversation: title="${currentConversation.title || "untitled"}", tags=[${(currentConversation.tags || []).join(", ")}], summary="${currentConversation.summary || "none"}"`
      : "No current conversation context.";

    const messagesText = recentMessages
      .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
      .join("\n");

    const context = {
      systemPrompt: "You are a topic classifier. Given recent messages and the current conversation context, determine if the topic has shifted. Respond with JSON only, no markdown: { \"sameTopic\": boolean, \"newTags\": string[], \"suggestedTitle\": string }",
      messages: [
        {
          role: "user" as const,
          content: `${convoContext}\n\nRecent messages:\n${messagesText}\n\nHas the topic shifted from the current conversation context? Respond with JSON only.`,
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

    console.log(`[TopicClassifier] Provider: ${provider}, Model: ${modelId}, Result: ${result.slice(0, 200)}`);

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
