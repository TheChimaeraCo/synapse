import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const log = mutation({
  args: {
    userId: v.optional(v.id("authUsers")),
    action: v.string(),
    resource: v.string(),
    resourceId: v.optional(v.string()),
    details: v.optional(v.string()),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditLogs", {
      ...args,
      timestamp: Date.now(),
    });
  },
});

export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const n = args.limit ?? 20;
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_timestamp")
      .order("desc")
      .take(n);
    return logs;
  },
});

export const search = query({
  args: {
    userId: v.optional(v.id("authUsers")),
    action: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const n = args.limit ?? 50;

    if (args.userId) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId!))
        .order("desc")
        .take(n);
    }

    if (args.action) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", args.action!))
        .order("desc")
        .take(n);
    }

    return await ctx.db
      .query("auditLogs")
      .withIndex("by_timestamp")
      .order("desc")
      .take(n);
  },
});
