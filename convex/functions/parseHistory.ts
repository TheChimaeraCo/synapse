import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    gatewayId: v.id("gateways"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const results = await ctx.db
      .query("parseHistory")
      .withIndex("by_gateway", (q) => q.eq("gatewayId", args.gatewayId))
      .order("desc")
      .take(limit);
    return results;
  },
});

export const get = query({
  args: { id: v.id("parseHistory") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    gatewayId: v.id("gateways"),
    fileName: v.string(),
    fileSize: v.number(),
    textLength: v.number(),
    schema: v.string(),
    prompt: v.optional(v.string()),
    result: v.optional(v.string()),
    status: v.union(v.literal("success"), v.literal("error")),
    error: v.optional(v.string()),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    processingMs: v.number(),
    itemCount: v.optional(v.number()),
    sourceIp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("parseHistory", args);
  },
});

export const remove = mutation({
  args: { id: v.id("parseHistory") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const clearAll = mutation({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("parseHistory")
      .withIndex("by_gateway", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
    for (const record of records) {
      await ctx.db.delete(record._id);
    }
    return { deleted: records.length };
  },
});
