import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { classifyTopic } from "@/lib/topicClassifier";
import { summarizeConversation } from "@/lib/conversationSummarizer";

const CONVERSATION_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours - only timeout after a long absence, AI classifier handles topic shifts
const CLASSIFY_AFTER_N_MESSAGES = 3; // Start classifying early so topic shifts are detected promptly
const MIN_WORDS_FOR_AUTO_SHIFT = 6;
const MIN_WORDS_FOR_HARD_PIVOT = 9;
const DEFAULT_SPLIT_RELEVANCE_THRESHOLD = 28; // 1-100, lower = harder to split
const QUICK_TANGENT_MAX_WORDS = 12;
const SPLIT_THRESHOLD_CACHE_TTL_MS = 60_000;
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "about", "have", "has", "had", "will", "would",
  "could", "should", "your", "you", "our", "their", "they", "them", "what", "when", "where", "which",
  "while", "just", "like", "want", "need", "help", "please", "talk", "topic", "conversation",
]);
const splitThresholdCache = new Map<string, { value: number; expiresAt: number }>();

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  return Math.max(1, Math.min(100, rounded));
}

function tokenizeTopic(text: string): string[] {
  return Array.from(new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  ));
}

function topicOverlap(a: string, b: string): number {
  const aWords = new Set(tokenizeTopic(a));
  if (aWords.size === 0) return 0;
  const bWords = tokenizeTopic(b);
  return bWords.filter((w) => aWords.has(w)).length;
}

function countMeaningfulWords(message: string): number {
  return tokenizeTopic(message).length;
}

function isBridgeMessage(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const bridgePatterns = [
    /\b(also|btw|by the way|quick thing|quick note|on that note)\b/,
    /\b(one more thing|while we're at it|before we move on)\b/,
    /^(and|plus|another)\b/,
  ];
  return bridgePatterns.some((p) => p.test(lower));
}

function isQuickSideTangent(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const wordCount = message.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) return false;
  if (wordCount > QUICK_TANGENT_MAX_WORDS) return false;

  const cue = /\b(side note|quick question|quick one|btw|by the way|real quick)\b/.test(lower);
  const isQuestion = message.includes("?");
  return cue || isQuestion;
}

function hasStrongTopicShiftCue(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const strongShiftPatterns = [
    /^(side note|quick side note)\b/,
    /^(different|separate)\s+(question|topic)\b/,
    /^(switching gears|new question|new thread)\b/,
    /^(unrelated|totally unrelated)\b/,
  ];
  return strongShiftPatterns.some((p) => p.test(lower));
}

function computeActiveTopicText(activeConvo: {
  title?: string;
  summary?: string;
  tags?: string[];
  topics?: string[];
}): string {
  return [
    activeConvo.title,
    activeConvo.summary,
    ...(activeConvo.tags || []),
    ...(activeConvo.topics || []),
  ]
    .filter(Boolean)
    .join(" ");
}

function isHardTopicPivot(
  activeTopicText: string,
  newMessage: string,
  opts: {
    resumeIntent: boolean;
    wantsNew: boolean;
  }
): boolean {
  if (opts.wantsNew || opts.resumeIntent) return false;
  if (!activeTopicText.trim()) return false;

  const overlap = topicOverlap(activeTopicText, newMessage);
  const wordCount = countMeaningfulWords(newMessage);
  const bridgeLikely = isBridgeMessage(newMessage);
  const strongCue = hasStrongTopicShiftCue(newMessage);

  if (strongCue && overlap === 0 && wordCount >= 4) return true;

  // Fallback for obvious domain jumps without cue words.
  return overlap === 0 && !bridgeLikely && wordCount >= MIN_WORDS_FOR_HARD_PIVOT;
}

function estimateRelevanceScore(
  classification: { sameTopic: boolean; relevanceScore?: number },
  activeTopicText: string,
  newMessage: string
): number {
  if (classification.relevanceScore !== undefined) {
    return clampPercent(classification.relevanceScore, classification.sameTopic ? 70 : 20);
  }

  const overlap = topicOverlap(activeTopicText, newMessage);
  if (!classification.sameTopic) {
    // Keep clearly "different topic" classifications low unless overlap is strong.
    const score = 12 + Math.min(24, overlap * 8);
    return clampPercent(score, 18);
  }

  const words = countMeaningfulWords(newMessage);
  const overlapScore = Math.min(40, overlap * 15);
  const verbosityBonus = Math.min(12, words * 2);
  return clampPercent(52 + overlapScore + verbosityBonus, 70);
}

async function getConversationSplitThreshold(gatewayId: Id<"gateways">): Promise<number> {
  const cacheKey = String(gatewayId);
  const cached = splitThresholdCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let parsed = DEFAULT_SPLIT_RELEVANCE_THRESHOLD;
  try {
    const inherited = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId,
      key: "session.conversation_split_threshold",
    });
    if (inherited?.value) {
      parsed = clampPercent(Number.parseInt(inherited.value, 10), DEFAULT_SPLIT_RELEVANCE_THRESHOLD);
    }
  } catch {
    try {
      const legacy = await convexClient.query(api.functions.config.get, {
        key: "session.conversation_split_threshold",
      });
      if (legacy) {
        parsed = clampPercent(Number.parseInt(legacy, 10), DEFAULT_SPLIT_RELEVANCE_THRESHOLD);
      }
    } catch {
      // Ignore and use defaults.
    }
  }

  splitThresholdCache.set(cacheKey, {
    value: parsed,
    expiresAt: now + SPLIT_THRESHOLD_CACHE_TTL_MS,
  });
  return parsed;
}

function detectResumeConversationIntent(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const patterns = [
    /\bcontinue\b/,
    /\bpick up\b/,
    /\bpick this back up\b/,
    /\bresume\b/,
    /\bwhere we left off\b/,
    /\bas we discussed\b/,
    /\blike before\b/,
    /\bback to\b/,
  ];
  return patterns.some((p) => p.test(lower));
}

type ConversationLinkTarget = {
  targetId: Id<"conversations">;
  depth: number;
  relatedIds: Id<"conversations">[];
};

async function findHistoricalContinuation(
  gatewayId: Id<"gateways">,
  _userId: Id<"authUsers"> | undefined,
  message: string,
  opts?: {
    excludeConversationId?: Id<"conversations">;
    allowWeakMatch?: boolean;
  }
): Promise<ConversationLinkTarget | null> {
  try {
    const candidates = await convexClient.query(api.functions.conversations.findRelated, {
      gatewayId,
      ...( _userId ? { userId: _userId } : {}),
      queryText: message,
      limit: 8,
    });

    if (!candidates.length) return null;

    const threshold = opts?.allowWeakMatch ? 1 : 2;
    const filtered = candidates.filter((c: any) => c._id !== opts?.excludeConversationId);
    const best = filtered.find((c: any) => {
      const haystack = [c.title, c.summary, ...(c.tags || []), ...(c.topics || [])].filter(Boolean).join(" ");
      return topicOverlap(haystack, message) >= threshold;
    });
    if (!best) return null;

    return {
      targetId: best._id,
      depth: best.depth || 1,
      relatedIds: filtered.slice(0, 5).map((c: any) => c._id as Id<"conversations">),
    };
  } catch (err) {
    console.error("[ConvoSegmentation] Historical continuation search failed:", err);
    return null;
  }
}

/**
 * Resolve the current conversation for a message.
 * Creates a new conversation if needed, or continues the active one.
 * Chains related conversations together.
 */
export async function resolveConversation(
  sessionId: Id<"sessions">,
  gatewayId: Id<"gateways">,
  userId: Id<"authUsers"> | undefined,
  newMessage: string
): Promise<Id<"conversations">> {
  const activeConvo = await convexClient.query(api.functions.conversations.getActive, { sessionId });
  const wantsNew = detectNewConversationIntent(newMessage);
  const resumeIntent = detectResumeConversationIntent(newMessage);
  const splitThreshold = await getConversationSplitThreshold(gatewayId);

  if (!activeConvo) {
    const historicalLink = wantsNew
      ? null
      : await findHistoricalContinuation(
          gatewayId,
          userId,
          newMessage,
          { allowWeakMatch: resumeIntent }
        );

    // First message for this session - optionally resume a related closed conversation chain
    return await convexClient.mutation(api.functions.conversations.create, {
      sessionId,
      gatewayId,
      userId,
      previousConvoId: historicalLink?.targetId,
      relatedConvoIds: historicalLink?.relatedIds,
      depth: historicalLink ? historicalLink.depth + 1 : 1,
    });
  }

  // Check time gap
  const gap = Date.now() - activeConvo.lastMessageAt;
  const isLongGap = gap >= CONVERSATION_TIMEOUT_MS;
  const activeTopicText = computeActiveTopicText(activeConvo);
  const hardPivot = isHardTopicPivot(activeTopicText, newMessage, { resumeIntent, wantsNew });

  // Determine if we should run AI topic classification
  let topicShifted = false;
  let resumeRelated = false;
  let relevanceScore = 100;
  let classificationResult: { sameTopic: boolean; relevanceScore?: number; suggestedTitle?: string; newTags?: string[] } | null = null;
  const nextCount = activeConvo.messageCount + 1;
  const shouldClassify = nextCount >= CLASSIFY_AFTER_N_MESSAGES;
  console.log(`[ConvoSegmentation] Message ${nextCount} in conversation, shouldClassify: ${shouldClassify}`);
  if (!wantsNew && !isLongGap && shouldClassify) {
    try {
      // Get recent messages for classification + include the new incoming message
      const recentMsgs = await convexClient.query(api.functions.messages.listByConversation, {
        conversationId: activeConvo._id,
        limit: 10,
      });
      const msgsForClassification = [
        ...recentMsgs.map((m: any) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: newMessage },
      ];
      const classification = await classifyTopic(
        msgsForClassification,
        { title: activeConvo.title, tags: activeConvo.tags, summary: activeConvo.summary },
        gatewayId as string
      );
      classificationResult = classification;
      relevanceScore = estimateRelevanceScore(classification, activeTopicText, newMessage);
      topicShifted = relevanceScore < splitThreshold;
      if (topicShifted) {
        const overlap = activeTopicText ? topicOverlap(activeTopicText, newMessage) : 0;
        const wordCount = countMeaningfulWords(newMessage);
        const bridgeLikely = isBridgeMessage(newMessage);
        const quickTangent = isQuickSideTangent(newMessage);
        const weakShiftSignal =
          overlap >= 1 ||
          wordCount < MIN_WORDS_FOR_AUTO_SHIFT ||
          bridgeLikely ||
          quickTangent ||
          resumeIntent;

        if (weakShiftSignal) {
          topicShifted = false;
          console.log(
            `[ConvoSegmentation] Dampened classifier shift (score=${relevanceScore}, threshold=${splitThreshold}, overlap=${overlap}, words=${wordCount}, bridge=${bridgeLikely}, quickTangent=${quickTangent}, resumeIntent=${resumeIntent}). Staying in current conversation.`
          );
        }
      }
      if (topicShifted) {
        console.log(`[ConvoSegmentation] Relevance ${relevanceScore} < threshold ${splitThreshold}; topic shift after ${activeConvo.messageCount} messages. New topic: ${classification.suggestedTitle || "unknown"}`);
      } else if (!activeConvo.title && classification.suggestedTitle) {
        // Same topic but conversation has no title yet - update it
        try {
          await convexClient.mutation(api.functions.conversations.update, {
            id: activeConvo._id,
            ...(classification.suggestedTitle ? { title: classification.suggestedTitle } : {}),
            ...(classification.newTags?.length ? { tags: classification.newTags } : {}),
          });
          console.log(`[ConvoSegmentation] Updated conversation title: "${classification.suggestedTitle}"`);
        } catch (err) {
          console.error("[ConvoSegmentation] Failed to update conversation title:", err);
        }
      }
    } catch (err) {
      console.error("[ConvoSegmentation] Topic classification failed, continuing same convo:", err);
    }
  }

  if (!topicShifted && hardPivot && !isLongGap) {
    topicShifted = true;
    relevanceScore = 0;
    if (!classificationResult) {
      classificationResult = {
        sameTopic: false,
        relevanceScore: 0,
        suggestedTitle: "New topic",
      };
    }
    console.log("[ConvoSegmentation] Hard pivot detected from message content; starting a new conversation segment.");
  }

  // If the user returns after a long gap, decide whether this is a continuation chain.
  // We still start a new conversation segment, but can link it to preserve continuity.
  if (!wantsNew && isLongGap) {
    try {
      const activeTopicText = [activeConvo.title, activeConvo.summary, ...(activeConvo.tags || []), ...(activeConvo.topics || [])]
        .filter(Boolean)
        .join(" ");
      if (activeTopicText && checkTopicRelation(activeTopicText, newMessage)) {
        resumeRelated = true;
      } else {
        const resumeClassification = await classifyTopic(
          [
            ...(activeConvo.summary ? [{ role: "assistant", content: activeConvo.summary }] : []),
            { role: "user", content: newMessage },
          ],
          { title: activeConvo.title, tags: activeConvo.tags, summary: activeConvo.summary },
          gatewayId as string
        );
        resumeRelated = !!resumeClassification.sameTopic;
      }
      if (resumeRelated) {
        console.log("[ConvoSegmentation] Long-gap message appears to continue previous topic; chaining new segment.");
      }
    } catch (err) {
      console.error("[ConvoSegmentation] Long-gap relation check failed:", err);
    }
  }

  // Under timeout AND no explicit intent AND no topic shift - same conversation
  if (!isLongGap && !wantsNew && !topicShifted) {
    await convexClient.mutation(api.functions.conversations.updateMessageCount, { id: activeConvo._id });
    return activeConvo._id;
  }

  let linkTarget: ConversationLinkTarget | null = null;
  if (!wantsNew) {
    // Long-gap continuation of the same topic -> chain to the just-closed active conversation.
    if (!topicShifted && isLongGap && resumeRelated) {
      linkTarget = {
        targetId: activeConvo._id,
        depth: activeConvo.depth || 1,
        relatedIds: [activeConvo._id],
      };
    } else {
      // If user pivots to a topic discussed before, resume that historical chain.
      linkTarget = await findHistoricalContinuation(gatewayId, userId, newMessage, {
        excludeConversationId: activeConvo._id,
        allowWeakMatch: resumeIntent,
      });
      if (linkTarget) {
        console.log(`[ConvoSegmentation] Resuming prior chain from conversation ${linkTarget.targetId}`);
      }
    }
  }

  // Close the old conversation
  await convexClient.mutation(api.functions.conversations.close, {
    id: activeConvo._id,
  });

  // Fire-and-forget summarization of the closed conversation
  summarizeConversation(activeConvo._id).catch((err) =>
    console.error("[ConvoSegmentation] Summarization failed:", err)
  );

  const relatedSet = new Set<string>([
    ...(linkTarget?.relatedIds || []).map((id) => String(id)),
    String(activeConvo._id),
  ]);
  if (linkTarget?.targetId) {
    relatedSet.add(String(linkTarget.targetId));
  }
  const relatedConvoIds = Array.from(relatedSet).slice(0, 8) as Id<"conversations">[];

  // Create new one, always chain linearly from the prior segment.
  // Historical continuity links are kept in relatedConvoIds.
  const newConvoId = await convexClient.mutation(api.functions.conversations.create, {
    sessionId,
    gatewayId,
    userId,
    previousConvoId: activeConvo._id,
    relatedConvoIds,
    depth: (activeConvo.depth || 1) + 1,
    relations: [
      {
        conversationId: activeConvo._id,
        type: topicShifted ? "topic_shift" : "continuation",
      },
      ...(linkTarget?.targetId && String(linkTarget.targetId) !== String(activeConvo._id)
        ? [{ conversationId: linkTarget.targetId, type: "historical_link" }]
        : []),
    ],
    ...(classificationResult?.suggestedTitle ? { title: classificationResult.suggestedTitle } : {}),
    ...(classificationResult?.newTags?.length ? { tags: classificationResult.newTags } : {}),
  });

  return newConvoId;
}

/**
 * Detect if the user explicitly wants to start a new conversation.
 */
export function detectNewConversationIntent(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const patterns = [
    /new (conversation|convo|topic|subject|chat)/,
    /move on/,
    /change (the )?(subject|topic)/,
    /let'?s talk about something else/,
    /start (a )?(new|fresh)/,
    /different (topic|subject)/,
    /anyway[,.]?\s/,  // "Anyway, ..." as topic shift (only if followed by more text)
    /^(ok|okay|alright|so)\s*,?\s*(new topic|next|moving on)/i,
  ];
  return patterns.some((p) => p.test(lower));
}

/**
 * Simple keyword overlap check for MVP.
 * Returns true if there are at least 2 significant words in common.
 */
export function checkTopicRelation(previousSummary: string, newMessage: string): boolean {
  return topicOverlap(previousSummary, newMessage) >= 2;
}

/**
 * Build conversation chain context for the system prompt.
 * Returns formatted string with previous conversation summaries.
 */
export async function buildConversationChainContext(
  conversationId: Id<"conversations">
): Promise<string> {
  const chain = await convexClient.query(api.functions.conversations.getChain, {
    conversationId,
    maxDepth: 5,
  });

  if (chain.length <= 1) return "";

  // Skip the current conversation (first in chain), format the rest
  const previousConvos = chain.slice(1);
  if (previousConvos.length === 0) return "";

  let context = "\n\n## Earlier in this conversation thread:\n";
  for (const convo of previousConvos) {
    if (!convo.summary && !convo.title) continue;
    if (convo.title && convo.summary) {
      context += `- "${convo.title}": ${convo.summary}\n`;
    } else if (convo.summary) {
      context += `- ${convo.summary}\n`;
    } else {
      context += `- Discussed "${convo.title}"\n`;
    }
    if (convo.decisions && convo.decisions.length > 0) {
      context += "  Decisions: " + convo.decisions.map((d: any) => `${d.what}${d.reasoning ? ` (${d.reasoning})` : ""}`).join("; ") + "\n";
    }
  }

  const mergedState = new Map<string, {
    domain: string;
    attribute: string;
    value: string;
    sourceTitle?: string;
    previousValues: string[];
  }>();
  const orderedOldToNew = [...previousConvos].reverse();
  for (const convo of orderedOldToNew) {
    for (const update of (convo.stateUpdates || [])) {
      const domain = (update.domain || "").trim();
      const attribute = (update.attribute || "").trim();
      const value = (update.value || "").trim();
      if (!domain || !attribute || !value) continue;

      const key = `${domain.toLowerCase()}::${attribute.toLowerCase()}`;
      const existing = mergedState.get(key);
      const previousValues = existing?.value && existing.value !== value
        ? [existing.value, ...existing.previousValues].slice(0, 3)
        : (existing?.previousValues || []);

      mergedState.set(key, {
        domain,
        attribute,
        value,
        sourceTitle: convo.title,
        previousValues,
      });
    }
  }

  if (mergedState.size > 0) {
    context += "\n## Current thread state (newest overrides older):\n";
    const lines = Array.from(mergedState.values())
      .slice(0, 12)
      .map((s) => {
        const prior = s.previousValues.length > 0
          ? ` (previously: ${s.previousValues.join(" -> ")})`
          : "";
        const source = s.sourceTitle ? ` [from "${s.sourceTitle}"]` : "";
        return `- [${s.domain}] ${s.attribute}: ${s.value}${prior}${source}`;
      });
    context += lines.join("\n") + "\n";
  }

  return context;
}
