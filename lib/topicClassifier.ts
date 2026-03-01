import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { resolveAiSelection } from "@/lib/aiRouting";
import { resolveModelCompat } from "@/lib/modelCompat";

interface ClassificationResult {
  sameTopic: boolean;
  relevanceScore?: number; // 0-100, higher = more related to active topic
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
  "google-antigravity": "gemini-3.1-pro",
};

export async function classifyTopic(
  recentMessages: MessageForClassification[],
  currentConversation: ConversationContext | null,
  gatewayId?: string
): Promise<ClassificationResult> {
  const clampScore = (score: number): number => {
    if (!Number.isFinite(score)) return 50;
    return Math.max(0, Math.min(100, Math.round(score)));
  };

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
    const modelResolution = resolveModelCompat({
      provider,
      requestedModelId: preferredModelId,
      fallbackModelId: selection.model || undefined,
      getModel,
    });
    if (!modelResolution.model) {
      console.error(`[TopicClassifier] No classifier model found for provider "${provider}" (tried "${preferredModelId}"${selection.model ? `, "${selection.model}"` : ""})`);
      return { sameTopic: true };
    }
    const resolvedModelId = modelResolution.modelId;
    const model = modelResolution.model;

    const convoContext = currentConversation
      ? `Current conversation: title="${currentConversation.title || "untitled"}", tags=[${(currentConversation.tags || []).join(", ")}], summary="${currentConversation.summary || "none"}"`
      : "No current conversation context.";

    const messagesText = recentMessages
      .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
      .join("\n");

    const context = {
      systemPrompt: `You are a conversation relevance classifier.

IMPORTANT RULES:
- Output "relevanceScore" as an integer from 0 to 100:
  - 90-100: direct continuation of same topic
  - 70-89: clearly related sub-topic
  - 40-69: ambiguous / tangent
  - 0-39: likely different topic
- "sameTopic" should be true when relevanceScore >= 50.
- Side tangents and quick clarifications are usually still sameTopic unless clearly unrelated.

Respond with JSON only, no markdown: { "sameTopic": boolean, "relevanceScore": number, "newTags": string[], "suggestedTitle": string }`,
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
      const score =
        parsed.relevanceScore !== undefined
          ? clampScore(Number(parsed.relevanceScore))
          : undefined;
      const sameTopic =
        parsed.sameTopic !== undefined
          ? Boolean(parsed.sameTopic)
          : (score !== undefined ? score >= 50 : true);
      return {
        sameTopic,
        ...(score !== undefined ? { relevanceScore: score } : {}),
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
