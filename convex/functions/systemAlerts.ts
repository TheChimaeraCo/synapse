import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const create = mutation({
  args: {
    gatewayId: v.optional(v.id("gateways")),
    level: v.union(v.literal("info"), v.literal("warning"), v.literal("error"), v.literal("critical")),
    message: v.string(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("systemAlerts", {
      ...args,
      acknowledged: false,
      timestamp: Date.now(),
    });
  },
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
    unacknowledgedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const n = args.limit ?? 50;
    if (args.unacknowledgedOnly) {
      return await ctx.db
        .query("systemAlerts")
        .withIndex("by_acknowledged", (q) => q.eq("acknowledged", false))
        .order("desc")
        .take(n);
    }
    return await ctx.db
      .query("systemAlerts")
      .withIndex("by_timestamp")
      .order("desc")
      .take(n);
  },
});

export const unacknowledgedCount = query({
  args: {},
  handler: async (ctx) => {
    const alerts = await ctx.db
      .query("systemAlerts")
      .withIndex("by_acknowledged", (q) => q.eq("acknowledged", false))
      .collect();
    return alerts.length;
  },
});

export const acknowledge = mutation({
  args: {
    id: v.id("systemAlerts"),
    userId: v.optional(v.id("authUsers")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      acknowledged: true,
      acknowledgedBy: args.userId,
      acknowledgedAt: Date.now(),
    });
  },
});

export const acknowledgeAll = mutation({
  args: { userId: v.optional(v.id("authUsers")) },
  handler: async (ctx, args) => {
    const alerts = await ctx.db
      .query("systemAlerts")
      .withIndex("by_acknowledged", (q) => q.eq("acknowledged", false))
      .collect();
    const now = Date.now();
    for (const alert of alerts) {
      await ctx.db.patch(alert._id, {
        acknowledged: true,
        acknowledgedBy: args.userId,
        acknowledgedAt: now,
      });
    }
    return alerts.length;
  },
});
