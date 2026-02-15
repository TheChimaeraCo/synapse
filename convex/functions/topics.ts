import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const upsert = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    gatewayId: v.string(),
    personalWeight: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("topics")
      .withIndex("by_name_gatewayId", (q) =>
        q.eq("name", args.name).eq("gatewayId", args.gatewayId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        mentionCount: existing.mentionCount + 1,
        lastMentioned: Date.now(),
        ...(args.personalWeight !== undefined ? { personalWeight: args.personalWeight } : {}),
        ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      });
      return existing._id;
    }

    return await ctx.db.insert("topics", {
      name: args.name,
      category: args.category,
      personalWeight: args.personalWeight ?? 0.5,
      frequencyWeight: 0.1,
      lastMentioned: Date.now(),
      mentionCount: 1,
      gatewayId: args.gatewayId,
      metadata: args.metadata,
    });
  },
});

export const getActive = query({
  args: {
    gatewayId: v.string(),
    threshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const threshold = args.threshold ?? 0.3;
    const topics = await ctx.db
      .query("topics")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();

    return topics.filter((t) => {
      const combined = t.personalWeight * 0.6 + t.frequencyWeight * 0.4;
      return combined > threshold;
    });
  },
});

export const getByName = query({
  args: {
    name: v.string(),
    gatewayId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("topics")
      .withIndex("by_name_gatewayId", (q) =>
        q.eq("name", args.name).eq("gatewayId", args.gatewayId)
      )
      .first();
  },
});

export const list = query({
  args: { gatewayId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("topics")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
  },
});

export const updateWeights = mutation({
  args: {
    id: v.id("topics"),
    personalWeight: v.optional(v.number()),
    frequencyWeight: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: any = {};
    if (args.personalWeight !== undefined) patch.personalWeight = args.personalWeight;
    if (args.frequencyWeight !== undefined) patch.frequencyWeight = args.frequencyWeight;
    await ctx.db.patch(args.id, patch);
  },
});
