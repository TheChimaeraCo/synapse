// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildDefaultSystemPrompt } from "@/lib/templates";
import { buildConversationChainContext } from "@/lib/conversationManager";
import { buildTopicContext } from "@/lib/topicContext";
import { searchByEmbedding } from "@/lib/embeddings";

interface ContextResult {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  estimatedTokens: number;
}

// Soft total budget - we trim only if we exceed this
const TOTAL_BUDGET = 8000;

/**
 * Rough token estimate using ~4 chars per token heuristic.
 * Used for budget calculations - not exact, but fast.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Score a knowledge entry against the user message using keyword overlap.
 * Returns 0-1 relevance score.
 */
function scoreRelevance(entry: { category: string; key: string; value: string }, userMessage: string): number {
  // Identity knowledge always relevant
  if (entry.category === "identity") return 1.0;

  const msgWords = new Set(
    userMessage.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  );
  if (msgWords.size === 0) return 0.1; // no words to match, give baseline

  const entryText = `${entry.key} ${entry.value}`.toLowerCase();
  const entryWords = entryText.split(/\s+/).filter((w) => w.length > 2);
  if (entryWords.length === 0) return 0.1;

  const matches = entryWords.filter((w) => msgWords.has(w)).length;
  return Math.min(1.0, matches / Math.max(3, msgWords.size));
}

/**
 * Format knowledge entries, sorted by relevance, capped to token budget.
 * Uses semantic search when embeddings are available, falls back to keyword matching.
 */
async function formatKnowledgeSemantic(
  facts: Array<{ category: string; key: string; value: string; embedding?: number[]; _id?: string }>,
  userMessage: string,
  openaiKey?: string
): Promise<string> {
  if (facts.length === 0) return "";

  // Identity entries always included
  const identity = facts.filter((f) => f.category === "identity");
  const nonIdentity = facts.filter((f) => f.category !== "identity");

  // Try semantic search for non-identity entries
  let scored: Array<{ category: string; key: string; value: string; score: number }>;

  const hasEmbeddings = nonIdentity.some((f) => f.embedding && f.embedding.length > 0);

  if (hasEmbeddings || openaiKey) {
    try {
      const searchResults = await searchByEmbedding(
        userMessage,
        nonIdentity.map((f) => ({
          content: `${f.key} ${f.value}`,
          embedding: f.embedding,
          _id: (f as any)._id?.toString() || f.key,
        })),
        { openaiKey, topK: 15 }
      );

      // Map back to facts with scores
      const scoreMap = new Map(searchResults.map((r) => [r.id, r.score]));
      scored = nonIdentity.map((f) => ({
        ...f,
        score: scoreMap.get((f as any)._id?.toString() || f.key) ?? scoreRelevance(f, userMessage),
      }));
    } catch {
      // Fallback to keyword scoring
      scored = nonIdentity.map((f) => ({ ...f, score: scoreRelevance(f, userMessage) }));
    }
  } else {
    scored = nonIdentity.map((f) => ({ ...f, score: scoreRelevance(f, userMessage) }));
  }

  scored.sort((a, b) => b.score - a.score);

  const THRESHOLD = 0.05;
  const filtered = [
    ...identity.map((f) => ({ ...f, score: 1.0 })),
    ...scored.filter((f) => f.score >= THRESHOLD),
  ];

  const grouped: Record<string, string[]> = {};
  for (const f of filtered) {
    if (!grouped[f.category]) grouped[f.category] = [];
    grouped[f.category].push(`- ${f.key}: ${f.value}`);
  }

  if (Object.keys(grouped).length === 0) return "";

  let section = "\n\n## Known facts about this user:\n";
  for (const [cat, items] of Object.entries(grouped)) {
    section += `### ${cat}\n${items.join("\n")}\n`;
  }

  console.log(`[Context] Layer 2 (Knowledge): ${estimateTokens(section)} tokens (${filtered.length}/${facts.length} entries, semantic=${hasEmbeddings})`);
  return section;
}

/** Legacy sync wrapper */
function formatKnowledge(
  facts: Array<{ category: string; key: string; value: string }>,
  userMessage: string
): string {
  if (facts.length === 0) return "";
  const scored = facts.map((f) => ({ ...f, score: scoreRelevance(f, userMessage) }));
  scored.sort((a, b) => b.score - a.score);
  const THRESHOLD = 0.05;
  const filtered = scored.filter((f) => f.category === "identity" || f.score >= THRESHOLD);
  const grouped: Record<string, string[]> = {};
  for (const f of filtered) {
    if (!grouped[f.category]) grouped[f.category] = [];
    grouped[f.category].push(`- ${f.key}: ${f.value}`);
  }
  if (Object.keys(grouped).length === 0) return "";
  let section = "\n\n## Known facts about this user:\n";
  for (const [cat, items] of Object.entries(grouped)) {
    section += `### ${cat}\n${items.join("\n")}\n`;
  }
  return section;
}

/**
 * Get escalation-adjusted parameters.
 */
function getEscalationParams(level: number): { messageLimit: number; broadKnowledge: boolean; searchPast: boolean; hintNeeded: boolean } {
  switch (level) {
    case 1: return { messageLimit: 20, broadKnowledge: true, searchPast: false, hintNeeded: false };
    case 2: return { messageLimit: 20, broadKnowledge: true, searchPast: true, hintNeeded: false };
    case 3: return { messageLimit: 20, broadKnowledge: true, searchPast: true, hintNeeded: true };
    default: return { messageLimit: 10, broadKnowledge: false, searchPast: false, hintNeeded: false };
  }
}

/**
 * Build the full context for an AI chat completion request.
 * Assembles 5 layers: identity/soul, knowledge (semantic), message history,
 * topic context (past conversations), and project context.
 * Trims oldest messages if total exceeds TOTAL_BUDGET.
 *
 * @param sessionId - Active chat session
 * @param agentId - Agent whose personality/knowledge to use
 * @param userMessage - Current user message (used for knowledge relevance scoring)
 * @param tokenBudget - Soft token limit (default 5000, actual cap is TOTAL_BUDGET)
 * @param _conversationId - Optional conversation for scoping (currently unused)
 */
export async function buildContext(
  sessionId: Id<"sessions">,
  agentId: Id<"agents">,
  userMessage: string,
  tokenBudget: number = 5000,
  _conversationId?: Id<"conversations">
): Promise<ContextResult> {
  const sessionDoc = await convexClient.query(api.functions.sessions.get, { id: sessionId });
  const userId = sessionDoc?.externalUserId;

  // Get active conversation for escalation level
  let escalationLevel = 0;
  let activeConvo: any = null;
  try {
    activeConvo = await convexClient.query(api.functions.conversations.getActive, { sessionId });
    escalationLevel = activeConvo?.escalationLevel ?? 0;
  } catch {}

  const escParams = getEscalationParams(escalationLevel);

  const [agent, knowledge] = await Promise.all([
    convexClient.query(api.functions.agents.get, { id: agentId }),
    convexClient.query(api.functions.knowledge.getWithEmbeddings, {
      agentId,
      userId,
    }).catch(() =>
      // Fallback if getWithEmbeddings not deployed yet
      convexClient.query(api.functions.knowledge.getRelevant, {
        agentId,
        userId,
        limit: escParams.broadKnowledge ? 50 : 20,
      })
    ),
  ]);

  // Load messages scoped to conversation if available, fall back to flat stream
  let recentMessages: any[];
  if (_conversationId) {
    try {
      recentMessages = await convexClient.query(api.functions.messages.listByConversation, {
        conversationId: _conversationId,
        limit: escParams.messageLimit,
      });
      console.log(`[Context] Scoped to conversation ${_conversationId}: ${recentMessages.length} messages`);
    } catch (err) {
      console.error("[Context] Conversation-scoped load failed, falling back to flat:", err);
      recentMessages = await convexClient.query(api.functions.messages.getRecent, {
        sessionId,
        limit: escParams.messageLimit,
      });
    }
  } else {
    recentMessages = await convexClient.query(api.functions.messages.getRecent, {
      sessionId,
      limit: escParams.messageLimit,
    });
  }

  if (!agent) throw new Error("Agent not found");

  // --- Layer 1: Identity/Soul ---
  let onboardingPrompt = "";
  let useTemplateBase = false;
  let soulSection = "";
  try {
    const soul = await convexClient.query(api.functions.onboarding.getSoul, {
      gatewayId: agent.gatewayId,
    });
    if (!soul) {
      useTemplateBase = true;
      let userName = "";
      try {
        const authUser = await convexClient.query(api.functions.config.get, { key: "owner_name" });
        userName = authUser || "";
      } catch {}

      onboardingPrompt = `\n\n---\n\nIMPORTANT - FIRST CONVERSATION:
You are brand new. You just came into existence. This is your very first conversation with your person${userName ? ` (their name is ${userName})` : ""}.

Your job right now is to get to know them through natural conversation. Don't be a form. Don't ask rapid-fire questions. Be curious, warm, and genuine.

Learn about them:
- What they do, what they need help with
- What kind of personality they want from you
- What they'd like to call you (or suggest a name based on the vibe)
- Their interests, location, anything that helps you serve them better

As you learn things, naturally reflect them back. After a few exchanges when you feel you know enough, tell them you're ready and summarize who you've decided to become. Then just BE that from then on.

You don't have a name yet. You don't have a personality yet. You're discovering both right now through this conversation. Be real.`;
    } else {
      // Build soul section from database
      const soulParts: string[] = [];
      if (soul.name) soulParts.push(`Your name is ${soul.name}.`);
      if (soul.personality) soulParts.push(`Personality: ${soul.personality}`);
      if (soul.purpose) soulParts.push(`Purpose: ${soul.purpose}`);
      if (soul.tone) soulParts.push(`Communication style: ${soul.tone}`);
      if (soulParts.length > 0) {
        soulSection = `\n\n## Your Identity\n${soulParts.join("\n")}`;
      }
    }
  } catch {}

  // Load response style config if available
  let styleSection = "";
  try {
    const styleJson = await convexClient.query(api.functions.config.get, { key: "response_style" });
    if (styleJson) {
      const style = JSON.parse(styleJson);
      const styleParts: string[] = [];
      if (style.verbosity < 0.3) styleParts.push("Keep responses concise and to the point.");
      else if (style.verbosity > 0.7) styleParts.push("Provide detailed, thorough responses.");
      if (style.formality < 0.3) styleParts.push("Use a casual, relaxed tone.");
      else if (style.formality > 0.7) styleParts.push("Maintain a professional, formal tone.");
      if (style.tonePreset === "custom" && style.customTone) styleParts.push(`Tone: ${style.customTone}`);
      if (styleParts.length > 0) {
        styleSection = `\n\n## Response Style\n${styleParts.join("\n")}`;
      }
    }
  } catch {}

  // --- Soul Evolution insights ---
  let soulEvolutionSection = "";
  try {
    const soulInsights = await convexClient.query(api.functions.soulEvolution.getForPrompt, {
      agentId,
      limit: 20,
    });
    if (soulInsights && soulInsights.length > 0) {
      const insightLines = soulInsights.map((i: any) => `- ${i.insight}`).join("\n");
      soulEvolutionSection = `\n\n## Evolved Understanding\nThese are patterns and dynamics you've learned over time through conversations:\n${insightLines}`;
    }
  } catch (err) {
    console.error("[Context] Failed to load soul evolution:", err);
  }

  const basePrompt = useTemplateBase ? buildDefaultSystemPrompt() : agent.systemPrompt;
  let identitySection = basePrompt + soulSection + soulEvolutionSection + styleSection + onboardingPrompt;
  console.log(`[Context] Layer 1 (Identity): ${estimateTokens(identitySection)} tokens`);

  // --- Layer 2: Knowledge (semantic search when available) ---
  let openaiKey: string | undefined;
  try {
    openaiKey = await convexClient.query(api.functions.config.get, { key: "openai_api_key" }) || undefined;
  } catch {}

  const knowledgeSection = await formatKnowledgeSemantic(
    knowledge.map((k: any) => ({
      category: k.category,
      key: k.key,
      value: k.value,
      embedding: k.embedding,
      _id: k._id,
    })),
    userMessage,
    openaiKey
  );

  // --- Layer 3: Messages ---
  let messages = recentMessages
    .map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content }))
    .filter((m: any) => m.role === "user" || m.role === "assistant");

  let messageTokens = messages.reduce((sum: number, m: any) => sum + estimateTokens(m.content), 0);
  console.log(`[Context] Layer 3 (Messages): ${messageTokens} tokens (${messages.length} messages)`);

  // --- Chain summaries (from conversation's relations) ---
  let conversationChainSection = "";
  const chainConvoId = _conversationId || activeConvo?._id;
  if (chainConvoId) {
    try {
      conversationChainSection = await buildConversationChainContext(chainConvoId);
    } catch (err) {
      console.error("Failed to build conversation chain context:", err);
    }
  }
  if (conversationChainSection) {
    console.log(`[Context] Chain summaries: ${estimateTokens(conversationChainSection)} tokens`);
  }

  // --- Layer 4: Topic context (past conversation search) ---
  // Always search past conversations - this is how the agent feels human
  // and can reference prior discussions naturally
  let topicSection = "";
  try {
    topicSection = await buildTopicContext(
      agent.gatewayId,
      userMessage,
      800 // soft cap for topic context
    );
  } catch (err) {
    console.error("Topic context failed:", err);
  }

  // --- Escalation hint ---
  let escalationHint = "";
  if (escParams.hintNeeded) {
    escalationHint = "\n\n[System note: You seem to lack sufficient context for this conversation. If you're unsure about something, ask the user to clarify rather than guessing.]\n";
  }

  // --- Layer 5: Project context (if conversation is linked to a project) ---
  let projectSection = "";
  if (activeConvo?.projectId) {
    try {
      const projectCtx = await convexClient.query(api.functions.projects.getContext, {
        id: activeConvo.projectId,
      });
      if (projectCtx) {
        projectSection = `\n\n${projectCtx}`;
        console.log(`[Context] Layer 5 (Project): ${estimateTokens(projectSection)} tokens`);
      }
    } catch (err) {
      console.error("Failed to build project context:", err);
    }
  }

  // --- Assemble ---
  let systemPrompt = identitySection + knowledgeSection + conversationChainSection + topicSection + projectSection + escalationHint;

  let totalTokens = estimateTokens(systemPrompt) + messageTokens;
  console.log(`[Context] Total: ${totalTokens} tokens (soft budget: ${TOTAL_BUDGET})`);

  // Only trim if significantly over budget - drop oldest messages first
  if (totalTokens > TOTAL_BUDGET) {
    while (totalTokens > TOTAL_BUDGET && messages.length > 2) {
      const removed = messages.shift()!;
      messageTokens -= estimateTokens(removed.content);
      totalTokens = estimateTokens(systemPrompt) + messageTokens;
    }
    console.log(`[Context] Trimmed to: ${totalTokens} tokens (${messages.length} messages kept)`);
  }

  return {
    systemPrompt,
    messages,
    estimatedTokens: totalTokens,
  };
}
