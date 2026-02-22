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

const FOLLOWUP_PROMPT = `Extract proactive follow-ups from this conversation.

Return JSON only:
{
  "followups": [
    {
      "topic": "short topic label",
      "prompt": "single follow-up message/question to send later",
      "dueAtIso": "ISO-8601 timestamp with timezone",
      "confidence": 0.0-1.0,
      "tags": ["tag1", "tag2"]
    }
  ]
}

Rules:
- Only include follow-ups when the user clearly mentioned a future intent, pending outcome, or check-back moment.
- If no specific future check-in exists, return an empty array.
- Keep prompt concise (max ~1 sentence).
- dueAtIso must be in the future relative to the provided current time.
- Never include secrets, API keys, tokens, credentials, or sensitive identifiers.
- Max 5 followups.`;

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

function parseBool(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function sanitizeFollowups(
  raw: any,
  now: number,
): Array<{ topic: string; prompt: string; dueAt: number; confidence?: number; tags?: string[] }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ topic: string; prompt: string; dueAt: number; confidence?: number; tags?: string[] }> = [];
  const maxDueAt = now + 90 * 24 * 60 * 60 * 1000;
  for (const item of raw.slice(0, 10)) {
    if (!item || typeof item !== "object") continue;
    const topic = typeof item.topic === "string" ? item.topic.trim().slice(0, 80) : "";
    const prompt = typeof item.prompt === "string" ? item.prompt.trim().slice(0, 220) : "";
    const dueAtIso = typeof item.dueAtIso === "string" ? item.dueAtIso.trim() : "";
    const dueAt = dueAtIso ? Date.parse(dueAtIso) : NaN;
    if (!topic || !prompt || !Number.isFinite(dueAt)) continue;
    if (dueAt <= now + 5 * 60 * 1000 || dueAt > maxDueAt) continue;
    if (containsSensitiveLikeValue(`${topic} ${prompt}`)) continue;
    const tags = Array.isArray(item.tags)
      ? item.tags
        .filter((t: any) => typeof t === "string" && t.trim())
        .map((t: string) => t.trim().toLowerCase().slice(0, 40))
        .slice(0, 8)
      : undefined;
    out.push({
      topic,
      prompt,
      dueAt,
      ...(typeof item.confidence === "number" ? { confidence: Math.max(0, Math.min(1, item.confidence)) } : {}),
      ...(tags && tags.length ? { tags } : {}),
    });
  }
  return out.slice(0, 5);
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function nextWeekdayAt(now: number, weekday: number, hour = 18, minute = 0): number {
  const date = new Date(now);
  const current = date.getDay();
  let delta = weekday - current;
  if (delta < 0) delta += 7;
  if (delta === 0) {
    const sameDay = new Date(now);
    sameDay.setHours(hour, minute, 0, 0);
    if (sameDay.getTime() > now + 5 * 60 * 1000) return sameDay.getTime();
    delta = 7;
  }
  const out = new Date(now + delta * 24 * 60 * 60 * 1000);
  out.setHours(hour, minute, 0, 0);
  return out.getTime();
}

function extractHeuristicFollowups(
  messages: Array<{ role: string; content: string }>,
  now: number,
): Array<{ topic: string; prompt: string; dueAt: number; confidence?: number; tags?: string[] }> {
  const items: Array<{ topic: string; prompt: string; dueAt: number; confidence?: number; tags?: string[] }> = [];
  const userMessages = messages.filter((m) => m.role === "user").slice(-20);
  for (const msg of userMessages) {
    const text = (msg.content || "").trim();
    if (!text) continue;
    const lower = text.toLowerCase();
    const intent = /\b(maybe|might|plan(?:ning)? to|going to|gonna|thinking about|considering)\b/.test(lower);
    if (!intent) continue;

    const weekdayName = Object.keys(WEEKDAYS).find((day) => lower.includes(day));
    if (!weekdayName) continue;
    const dueAt = nextWeekdayAt(now, WEEKDAYS[weekdayName], 18, 0);
    if (!Number.isFinite(dueAt)) continue;

    if (/\bmovie|cinema|theater\b/.test(lower)) {
      items.push({
        topic: "movie_plan",
        prompt: `You mentioned maybe seeing a movie on ${weekdayName}. Did you end up going?`,
        dueAt,
        confidence: 0.65,
        tags: ["movie", "followup"],
      });
      continue;
    }

    items.push({
      topic: "pending_plan",
      prompt: `Quick follow-up on your plan for ${weekdayName}: did it happen, or should we adjust it?`,
      dueAt,
      confidence: 0.5,
      tags: ["followup"],
    });
    if (items.length >= 3) break;
  }
  return items.slice(0, 3);
}

async function maybeExtractFollowups(args: {
  gatewayId: Id<"gateways">;
  sessionId: Id<"sessions">;
  conversationId: Id<"conversations">;
  userId?: Id<"authUsers">;
  summary?: string;
  formattedConversation: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<void> {
  const enabledRaw = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
    gatewayId: args.gatewayId,
    key: "proactive.enabled",
  }).catch(() => null);
  const modeRaw = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
    gatewayId: args.gatewayId,
    key: "proactive.mode",
  }).catch(() => null);
  const timezoneRaw = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
    gatewayId: args.gatewayId,
    key: "proactive.timezone",
  }).catch(() => null);
  const identityTimezoneRaw = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
    gatewayId: args.gatewayId,
    key: "identity.timezone",
  }).catch(() => null);

  if (!parseBool(enabledRaw?.value)) return;
  const mode = (modeRaw?.value || "followups_only").trim().toLowerCase();
  if (mode === "off") return;

  const now = Date.now();
  const timezone = (timezoneRaw?.value || identityTimezoneRaw?.value || "UTC").trim() || "UTC";
  const selection = await resolveAiSelection({
    gatewayId: args.gatewayId,
    capability: "summary",
    message: args.summary || args.formattedConversation.slice(0, 1200),
  });
  const provider = selection.provider;
  const key = selection.apiKey;
  if (!key) return;

  const { registerBuiltInApiProviders, getModel, streamSimple } = await import("@mariozechner/pi-ai");
  registerBuiltInApiProviders();
  const preferredModelId = SUMMARY_MODELS[provider] || SUMMARY_MODELS.anthropic;
  let model = getModel(provider as any, preferredModelId as any);
  if (!model && selection.model) model = getModel(provider as any, selection.model as any);
  if (!model) return;

  const prompt = `${FOLLOWUP_PROMPT}

Current time: ${new Date(now).toISOString()}
Timezone: ${timezone}

Conversation:
${args.formattedConversation.slice(0, 16_000)}`;

  let text = "";
  const aiStream = streamSimple(model, {
    systemPrompt: "",
    messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
  }, { maxTokens: 500, apiKey: key });
  for await (const event of aiStream) {
    if (event.type === "text_delta") text += event.delta;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return;
    }
  }

  let items = sanitizeFollowups(parsed?.followups, now);
  if (items.length === 0) {
    items = extractHeuristicFollowups(args.messages, now);
  }
  if (items.length === 0) return;

  const session = await convexClient.query(api.functions.sessions.get, { id: args.sessionId });
  if (!session) return;

  await convexClient.mutation((api as any).functions.proactive.createMany, {
    gatewayId: args.gatewayId,
    sessionId: args.sessionId,
    conversationId: args.conversationId,
    userId: args.userId,
    channelId: session.channelId,
    externalUserId: session.externalUserId,
    sourceSummary: args.summary,
    items,
  });
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

    // Extract proactive follow-up loops for future check-ins.
    try {
      await maybeExtractFollowups({
        gatewayId: convo.gatewayId,
        sessionId: convo.sessionId,
        conversationId,
        userId: convo.userId || undefined,
        summary: parsed.summary || undefined,
        formattedConversation: formatted,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });
    } catch (err) {
      console.error("[conversationSummarizer] Follow-up extraction failed:", err);
    }

    // Fire-and-forget soul reflection
    reflectOnConversation(conversationId, convo.gatewayId).catch((err) =>
      console.error("[conversationSummarizer] Soul reflection failed:", err)
    );
  } catch (err) {
    console.error("[conversationSummarizer] Error:", err);
  }
}
