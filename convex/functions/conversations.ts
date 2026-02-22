import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const getActive = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const convos = await ctx.db
      .query("conversations")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .order("desc")
      .take(1);
    return convos[0] ?? null;
  },
});

export const get = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    sessionId: v.id("sessions"),
    gatewayId: v.id("gateways"),
    userId: v.optional(v.id("authUsers")),
    startSeq: v.optional(v.number()),
    previousConvoId: v.optional(v.id("conversations")),
    relatedConvoIds: v.optional(v.array(v.id("conversations"))),
    relations: v.optional(v.array(v.object({
      conversationId: v.id("conversations"),
      type: v.string(),
    }))),
    depth: v.optional(v.number()),
    title: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("conversations", {
      gatewayId: args.gatewayId,
      sessionId: args.sessionId,
      userId: args.userId,
      status: "active",
      startSeq: args.startSeq,
      endSeq: args.startSeq,
      relations: args.relations,
      previousConvoId: args.previousConvoId,
      relatedConvoIds: args.relatedConvoIds,
      depth: args.depth ?? 1,
      knowledgeExtracted: false,
      messageCount: 1,
      firstMessageAt: now,
      lastMessageAt: now,
      ...(args.title ? { title: args.title } : {}),
      ...(args.tags ? { tags: args.tags } : {}),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("conversations"),
    title: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const patch: Record<string, any> = {};
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.tags !== undefined) patch.tags = updates.tags;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(id, patch);
    }
  },
});

export const advanceEnd = mutation({
  args: {
    id: v.id("conversations"),
    endSeq: v.number(),
  },
  handler: async (ctx, args) => {
    const convo = await ctx.db.get(args.id);
    if (!convo) return;
    await ctx.db.patch(args.id, {
      endSeq: args.endSeq,
      messageCount: convo.messageCount + 1,
      lastMessageAt: Date.now(),
    });
  },
});

export const close = mutation({
  args: {
    id: v.id("conversations"),
    summary: v.optional(v.string()),
    title: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    topics: v.optional(v.array(v.string())),
    decisions: v.optional(v.array(v.object({
      what: v.string(),
      reasoning: v.optional(v.string()),
      supersedes: v.optional(v.string()),
    }))),
    stateUpdates: v.optional(v.array(v.object({
      domain: v.string(),
      attribute: v.string(),
      value: v.string(),
      confidence: v.optional(v.number()),
      supersedes: v.optional(v.string()),
    }))),
    endSeq: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, {
      status: "closed",
      closedAt: Date.now(),
      ...(updates.summary !== undefined ? { summary: updates.summary } : {}),
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.tags !== undefined ? { tags: updates.tags } : {}),
      ...(updates.topics !== undefined ? { topics: updates.topics } : {}),
      ...(updates.decisions !== undefined ? { decisions: updates.decisions } : {}),
      ...(updates.stateUpdates !== undefined ? { stateUpdates: updates.stateUpdates } : {}),
      ...(updates.endSeq !== undefined ? { endSeq: updates.endSeq } : {}),
    });
  },
});

export const linkTo = mutation({
  args: {
    id: v.id("conversations"),
    targetConvoId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const convo = await ctx.db.get(args.id);
    if (!convo) throw new Error("Conversation not found");
    const target = await ctx.db.get(args.targetConvoId);
    if (!target) throw new Error("Target conversation not found");

    await ctx.db.patch(args.id, {
      previousConvoId: args.targetConvoId,
      depth: (target.depth || 1) + 1,
    });

    return { linked: true, depth: (target.depth || 1) + 1 };
  },
});

export const updateMessageCount = mutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const convo = await ctx.db.get(args.id);
    if (!convo) return;
    await ctx.db.patch(args.id, {
      messageCount: convo.messageCount + 1,
      lastMessageAt: Date.now(),
    });
  },
});

export const getChain = query({
  args: {
    conversationId: v.id("conversations"),
    maxDepth: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxDepth = args.maxDepth ?? 5;
    const chain: Array<{
      _id: Id<"conversations">;
      title?: string;
      summary?: string;
      tags?: string[];
      topics?: string[];
      decisions?: Array<{ what: string; reasoning?: string; supersedes?: string }>;
      stateUpdates?: Array<{
        domain: string;
        attribute: string;
        value: string;
        confidence?: number;
        supersedes?: string;
      }>;
      startSeq?: number;
      endSeq?: number;
      depth: number;
      messageCount: number;
      firstMessageAt: number;
      lastMessageAt: number;
    }> = [];

    let currentId: Id<"conversations"> | undefined = args.conversationId;
    for (let i = 0; i < maxDepth && currentId; i++) {
      const convo: any = await ctx.db.get(currentId);
      if (!convo) break;
      chain.push({
        _id: convo._id,
        title: convo.title,
        summary: convo.summary,
        tags: convo.tags,
        topics: convo.topics,
        decisions: convo.decisions,
        stateUpdates: convo.stateUpdates,
        startSeq: convo.startSeq,
        endSeq: convo.endSeq,
        depth: convo.depth,
        messageCount: convo.messageCount,
        firstMessageAt: convo.firstMessageAt,
        lastMessageAt: convo.lastMessageAt,
      });
      currentId = convo.previousConvoId;
    }

    return chain;
  },
});

export const list = query({
  args: {
    gatewayId: v.id("gateways"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("conversations")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .order("desc")
      .take(limit);
  },
});

export const listBySession = query({
  args: {
    sessionId: v.id("sessions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("conversations")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(limit);
  },
});

export const setEscalationLevel = mutation({
  args: {
    id: v.id("conversations"),
    level: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { escalationLevel: args.level });
  },
});

export const deleteAll = mutation({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("conversations")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
    for (const c of all) await ctx.db.delete(c._id);
    return all.length;
  },
});

export const findRelated = query({
  args: {
    gatewayId: v.id("gateways"),
    userId: v.optional(v.id("authUsers")),
    queryText: v.string(),
    limit: v.optional(v.number()),
    minKeywordMatches: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 5;
    const stopwords = new Set([
      "this", "that", "with", "from", "have", "about", "there", "their", "would", "could", "should",
      "into", "your", "what", "when", "where", "which", "while", "were", "been", "being", "also",
      "just", "than", "then", "them", "they", "want", "need", "help", "please", "talk", "continue",
      "again", "some", "more", "over", "under", "after", "before", "like",
    ]);
    const words = Array.from(new Set(
      args.queryText
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 2 && !stopwords.has(w))
    ));
    if (words.length === 0) return [];
    const minKeywordMatches = args.minKeywordMatches ?? (words.length >= 5 ? 2 : 1);

    let all = await ctx.db
      .query("conversations")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .filter((q) => q.eq(q.field("status"), "closed"))
      .order("desc")
      .take(100);
    if (args.userId) {
      all = all.filter((c) => c.userId === args.userId);
    }

    const now = Date.now();
    const scored = all.map((c) => {
      const text = [
        c.summary,
        c.title,
        ...(c.topics || []),
        ...(c.tags || []),
        ...(c.decisions || []).map((d) => `${d.what} ${d.reasoning || ""}`),
        ...(c.stateUpdates || []).map((s) => `${s.domain} ${s.attribute} ${s.value}`),
      ].filter(Boolean).join(" ").toLowerCase();

      const keywordScore = words.reduce((count, w) => count + (text.includes(w) ? 1 : 0), 0);
      const ageMs = Math.max(0, now - (c.lastMessageAt || c.firstMessageAt || now));
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      const recencyBonus = Math.max(0, 1 - Math.min(ageDays, 30) / 30); // 0..1 over 30 days
      const totalScore = keywordScore * 2 + recencyBonus * 0.35;
      return { convo: c, score: totalScore, keywordScore };
    }).filter((s) => s.keywordScore >= minKeywordMatches);

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.convo.lastMessageAt || 0) - (a.convo.lastMessageAt || 0);
    });
    return scored.slice(0, limit).map((s) => s.convo);
  },
});
