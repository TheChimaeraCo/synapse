import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

export const subscribe = mutation({
  args: {
    endpoint: v.string(),
    keys: v.object({
      p256dh: v.string(),
      auth: v.string(),
    }),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Upsert by endpoint
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { keys: args.keys, userId: args.userId });
      return existing._id;
    }
    return await ctx.db.insert("pushSubscriptions", {
      endpoint: args.endpoint,
      keys: args.keys,
      userId: args.userId,
      createdAt: Date.now(),
    });
  },
});

export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    if (sub) await ctx.db.delete(sub._id);
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("pushSubscriptions").collect();
  },
});
