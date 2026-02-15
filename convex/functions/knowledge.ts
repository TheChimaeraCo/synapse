import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "../_generated/server";

export const getRelevant = query({
  args: {
    agentId: v.id("agents"),
    userId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const results = await ctx.db
      .query("knowledge")
      .withIndex("by_agent_user", (q) => {
        const q2 = q.eq("agentId", args.agentId);
        return args.userId ? q2.eq("userId", args.userId) : q2;
      })
      .order("desc")
      .take(limit);
    return results;
  },
});

export const upsert = mutation({
  args: {
    agentId: v.id("agents"),
    gatewayId: v.id("gateways"),
    userId: v.optional(v.string()),
    category: v.string(),
    key: v.string(),
    value: v.string(),
    confidence: v.number(),
    source: v.string(),
    sourceMessageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // Find existing by key
    const existing = await ctx.db
      .query("knowledge")
      .withIndex("by_key", (q) =>
        q.eq("agentId", args.agentId).eq("userId", args.userId).eq("key", args.key)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        confidence: args.confidence,
        source: args.source,
        sourceMessageId: args.sourceMessageId,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("knowledge", {
      gatewayId: args.gatewayId,
      agentId: args.agentId,
      userId: args.userId,
      category: args.category,
      key: args.key,
      value: args.value,
      confidence: args.confidence,
      source: args.source,
      sourceMessageId: args.sourceMessageId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const search = query({
  args: {
    agentId: v.id("agents"),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.category) {
      return await ctx.db
        .query("knowledge")
        .withIndex("by_agent_category", (q) =>
          q.eq("agentId", args.agentId).eq("category", args.category!)
        )
        .collect();
    }
    return await ctx.db
      .query("knowledge")
      .withIndex("by_agent_user", (q) => q.eq("agentId", args.agentId))
      .collect();
  },
});

export const list = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("knowledge")
      .withIndex("by_agent_user", (q) => q.eq("agentId", args.agentId))
      .collect();
  },
});

export const remove = mutation({
  args: { id: v.id("knowledge") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// --- Internal functions for embeddings ---

export const getMissingEmbeddings = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const all = await ctx.db.query("knowledge").collect();
    return all
      .filter((k) => !k.embedding || k.embedding.length === 0)
      .slice(0, limit);
  },
});

export const getAllContent = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("knowledge").collect();
  },
});

export const getById = internalQuery({
  args: { id: v.id("knowledge") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const setEmbedding = internalMutation({
  args: {
    id: v.id("knowledge"),
    embedding: v.array(v.float64()),
    embeddingModel: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      embedding: args.embedding,
      embeddingModel: args.embeddingModel,
      updatedAt: Date.now(),
    });
  },
});

export const getWithEmbeddings = query({
  args: {
    agentId: v.id("agents"),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("knowledge")
      .withIndex("by_agent_user", (q) => {
        const q2 = q.eq("agentId", args.agentId);
        return args.userId ? q2.eq("userId", args.userId) : q2;
      })
      .collect();
    return results.map((k) => ({
      _id: k._id,
      category: k.category,
      key: k.key,
      value: k.value,
      confidence: k.confidence,
      embedding: k.embedding,
      embeddingModel: k.embeddingModel,
    }));
  },
});

export const update = mutation({
  args: {
    id: v.id("knowledge"),
    value: v.optional(v.string()),
    category: v.optional(v.string()),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: any = { updatedAt: Date.now() };
    if (fields.value !== undefined) updates.value = fields.value;
    if (fields.category !== undefined) updates.category = fields.category;
    if (fields.confidence !== undefined) updates.confidence = fields.confidence;
    await ctx.db.patch(id, updates);
  },
});
