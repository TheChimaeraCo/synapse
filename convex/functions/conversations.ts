import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

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
    });
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
      _id: string;
      title?: string;
      summary?: string;
      tags?: string[];
      topics?: string[];
      decisions?: Array<{ what: string; reasoning?: string; supersedes?: string }>;
      startSeq?: number;
      endSeq?: number;
      depth: number;
      messageCount: number;
      firstMessageAt: number;
      lastMessageAt: number;
    }> = [];

    let currentId: any = args.conversationId;
    for (let i = 0; i < maxDepth && currentId; i++) {
      const convo = await ctx.db.get(currentId);
      if (!convo) break;
      chain.push({
        _id: convo._id,
        title: convo.title,
        summary: convo.summary,
        tags: convo.tags,
        topics: convo.topics,
        decisions: convo.decisions,
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
    queryText: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 5;
    const words = args.queryText.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (words.length === 0) return [];

    const all = await ctx.db
      .query("conversations")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .filter((q) => q.eq(q.field("status"), "closed"))
      .order("desc")
      .take(100);

    const scored = all.map((c) => {
      const text = [c.summary, c.title, ...(c.topics || []), ...(c.tags || [])].filter(Boolean).join(" ").toLowerCase();
      const score = words.filter((w) => text.includes(w)).length;
      return { convo: c, score };
    }).filter((s) => s.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.convo);
  },
});
