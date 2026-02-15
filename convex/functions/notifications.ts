import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const create = mutation({
  args: {
    type: v.union(v.literal("info"), v.literal("warning"), v.literal("error"), v.literal("critical")),
    title: v.string(),
    message: v.string(),
    userId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      type: args.type,
      title: args.title,
      message: args.message,
      userId: args.userId,
      read: false,
      createdAt: Date.now(),
      metadata: args.metadata,
    });
  },
});

export const getUnread = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.userId) {
      return await ctx.db
        .query("notifications")
        .withIndex("by_userId_read", (q) => q.eq("userId", args.userId).eq("read", false))
        .collect();
    }
    const all = await ctx.db.query("notifications").collect();
    return all.filter((n) => !n.read);
  },
});

export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { read: true });
  },
});

export const markAllRead = mutation({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const unread = args.userId
      ? await ctx.db.query("notifications").withIndex("by_userId_read", (q) => q.eq("userId", args.userId).eq("read", false)).collect()
      : (await ctx.db.query("notifications").collect()).filter((n) => !n.read);
    for (const n of unread) {
      await ctx.db.patch(n._id, { read: true });
    }
  },
});

export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("notifications")
      .withIndex("by_createdAt")
      .order("desc")
      .take(args.limit ?? 20);
    return all;
  },
});

export const remove = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("notifications").collect();
    for (const n of all) {
      await ctx.db.delete(n._id);
    }
  },
});
