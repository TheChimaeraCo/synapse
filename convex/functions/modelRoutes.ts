import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const list = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("modelRoutes")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
  },
});

export const create = mutation({
  args: {
    gatewayId: v.id("gateways"),
    name: v.string(),
    description: v.string(),
    condition: v.any(),
    targetModel: v.string(),
    priority: v.number(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("modelRoutes", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("modelRoutes"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    condition: v.optional(v.any()),
    targetModel: v.optional(v.string()),
    priority: v.optional(v.number()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    await ctx.db.patch(id, { ...filtered, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("modelRoutes") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
