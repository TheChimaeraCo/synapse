import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    gatewayId: v.id("gateways"),
    userId: v.optional(v.id("authUsers")),
    sessionId: v.optional(v.id("sessions")),
    messageId: v.optional(v.id("messages")),
    conversationId: v.optional(v.id("conversations")),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
    storageId: v.optional(v.string()),
    url: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // If we have a storageId, generate a URL for it
    let url = args.url;
    if (args.storageId && !url) {
      const storageUrl = await ctx.storage.getUrl(args.storageId as any);
      if (storageUrl) url = storageUrl;
    }

    return await ctx.db.insert("files", {
      ...args,
      url,
      createdAt: Date.now(),
    });
  },
});

export const get = query({
  args: { id: v.id("files") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("files")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(50);
  },
});

export const listByConversation = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("files")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(limit);
  },
});

export const remove = mutation({
  args: { id: v.id("files") },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.id);
    if (!file) return;
    if (file.storageId) {
      try {
        await ctx.storage.delete(file.storageId as any);
      } catch {
        // Storage may already be deleted
      }
    }
    await ctx.db.delete(args.id);
  },
});

export const getUrl = query({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId as any);
  },
});
