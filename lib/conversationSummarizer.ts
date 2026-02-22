import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { reflectOnConversation } from "@/lib/soulReflection";
import { resolveAiSelection } from "@/lib/aiRouting";

const SUMMARY_MODELS: Record<string, string> = {
  anthropic: "claude-3-haiku-20240307",
  openrouter: "anthropic/claude-3-haiku",
  openai: "gpt-4o-mini",
  google: "gemini-2.0-flash",
};

const SUMMARY_PROMPT = `Analyze this conversation and provide a JSON response with:
- "title": A short, natural title (under 60 chars) - like how you'd describe this chat to a friend
- "summary": A 2-3 sentence summary focused on: what the user wanted, what was discussed, and what the outcome was. Include concrete nouns for numeric constraints (e.g. "car payment budget under $400/month" rather than just "budget under $400/month"). Write it as if you're reminding yourself what happened - e.g. "User asked about X. We worked through Y and decided Z." NOT a formal abstract.
- "topics": Array of topic keywords (3-7 items)
- "decisions": Array of decisions made, each with "what" (the decision), optional "reasoning", and optional "supersedes" when this decision replaces an older one.
- "stateUpdates": Array of stable context facts useful for future continuity, each with:
  - "domain": compact domain label like "car_search", "project", "travel", "health", "work"
  - "attribute": specific key like "target_vehicle", "max_monthly_payment", "location"
  - "value": explicit value
  - optional "confidence" between 0 and 1
  - optional "supersedes" describing prior value if this is a change
  Keep this concise (max 12 items), and prefer durable constraints/preferences over trivia.

Safety rules:
- Never include secrets, tokens, passwords, API keys, or long credential-like strings in summary, decisions, or stateUpdates.
- If sensitive strings appear in the chat, omit/redact them.

Respond ONLY with valid JSON, no markdown.`;

const SECRET_LIKE_PATTERNS = [
  /sk-[A-Za-z0-9._-]{16,}/,
  /AIza[0-9A-Za-z\-_]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}/,
];

function containsSensitiveLikeValue(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  if (SECRET_LIKE_PATTERNS.some((p) => p.test(value))) return true;
  if (/(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret|password|bearer)/i.test(value)) return true;
  return value.length > 48 && !/\s/.test(value) && /[A-Za-z]/.test(value) && /[0-9]/.test(value);
}

function sanitizeStateUpdates(raw: any): Array<{
  domain: string;
  attribute: string;
  value: string;
  confidence?: number;
  supersedes?: string;
}> {
  if (!Array.isArray(raw)) return [];

  const cleaned: Array<{
    domain: string;
    attribute: string;
    value: string;
    confidence?: number;
    supersedes?: string;
  }> = [];

  for (const entry of raw.slice(0, 20)) {
    if (!entry || typeof entry !== "object") continue;
    const domain = typeof entry.domain === "string" ? entry.domain.trim() : "";
    const attribute = typeof entry.attribute === "string" ? entry.attribute.trim() : "";
    const value = typeof entry.value === "string" ? entry.value.trim() : "";
    if (!domain || !attribute || !value) continue;
    if (containsSensitiveLikeValue(`${domain} ${attribute} ${value}`)) continue;

    const normalized = {
      domain: domain.slice(0, 40),
      attribute: attribute.slice(0, 80),
      value: value.slice(0, 240),
      ...(typeof entry.confidence === "number" ? { confidence: Math.max(0, Math.min(1, entry.confidence)) } : {}),
      ...(typeof entry.supersedes === "string" && entry.supersedes.trim()
        ? { supersedes: entry.supersedes.trim().slice(0, 240) }
        : {}),
    };
    cleaned.push(normalized);
  }

  return cleaned.slice(0, 12);
}

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

    const selection = await resolveAiSelection({
      gatewayId: convo.gatewayId || undefined,
      capability: "summary",
      message: formatted.slice(0, 1000),
    });
    const provider = selection.provider;
    const key = selection.apiKey;
    if (!key) {
      console.error("[conversationSummarizer] No API key, skipping summarization");
      return;
    }

    const { registerBuiltInApiProviders, getModel, streamSimple } = await import("@mariozechner/pi-ai");
    registerBuiltInApiProviders();
    const preferredModelId = SUMMARY_MODELS[provider] || SUMMARY_MODELS.anthropic;
    let resolvedModelId = preferredModelId;
    let model = getModel(provider as any, preferredModelId as any);
    if (!model && selection.model) {
      model = getModel(provider as any, selection.model as any);
      if (model) resolvedModelId = selection.model;
    }
    if (!model) {
      console.error(`[conversationSummarizer] No summary model found (tried "${preferredModelId}"${selection.model ? `, "${selection.model}"` : ""})`);
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
    const decisions = Array.isArray(parsed.decisions)
      ? parsed.decisions
        .filter((d: any) => d && typeof d.what === "string" && d.what.trim())
        .map((d: any) => ({
          what: d.what.trim().slice(0, 240),
          ...(typeof d.reasoning === "string" && d.reasoning.trim()
            ? { reasoning: d.reasoning.trim().slice(0, 480) }
            : {}),
          ...(typeof d.supersedes === "string" && d.supersedes.trim()
            ? { supersedes: d.supersedes.trim().slice(0, 240) }
            : {}),
        }))
        .slice(0, 10)
      : undefined;
    const stateUpdates = sanitizeStateUpdates(parsed.stateUpdates);

    await convexClient.mutation(api.functions.conversations.close, {
      id: conversationId,
      title: parsed.title || undefined,
      summary: parsed.summary || undefined,
      topics,
      tags: topics?.slice(0, 7),
      decisions,
      stateUpdates,
    });

    // Fire-and-forget soul reflection
    reflectOnConversation(conversationId, convo.gatewayId).catch((err) =>
      console.error("[conversationSummarizer] Soul reflection failed:", err)
    );
  } catch (err) {
    console.error("[conversationSummarizer] Error:", err);
  }
}
