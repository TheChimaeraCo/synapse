import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { resolveAiSelection } from "@/lib/aiRouting";

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
    const selection = await resolveAiSelection({
      gatewayId: gatewayId || undefined,
      capability: "classifier",
      message: recentMessages.map((m) => m.content).join("\n").slice(0, 1000),
    });
    const provider = selection.provider;
    const key = selection.apiKey;
    if (!key) {
      console.warn("[TopicClassifier] No API key, defaulting to sameTopic=true");
      return { sameTopic: true };
    }

    const { registerBuiltInApiProviders, getModel, streamSimple } = await import("@mariozechner/pi-ai");
    registerBuiltInApiProviders();

    const preferredModelId = HAIKU_MODELS[provider] || HAIKU_MODELS.anthropic;
    let resolvedModelId = preferredModelId;
    let model = getModel(provider as any, preferredModelId as any);
    if (!model && selection.model) {
      model = getModel(provider as any, selection.model as any);
      if (model) resolvedModelId = selection.model;
    }
    if (!model) {
      console.error(`[TopicClassifier] No classifier model found for provider "${provider}" (tried "${preferredModelId}"${selection.model ? `, "${selection.model}"` : ""})`);
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
