import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "../_generated/server";

export const list = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("channels")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("channels") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Internal query for webhook handlers that don't have gatewayId yet
export const findByPlatform = query({
  args: {
    platform: v.union(v.literal("telegram"), v.literal("hub"), v.literal("discord"), v.literal("whatsapp"), v.literal("custom")),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("channels")
      .withIndex("by_platform", (q) => q.eq("platform", args.platform))
      .first();
  },
});

export const getByPlatform = query({
  args: {
    gatewayId: v.id("gateways"),
    platform: v.union(v.literal("telegram"), v.literal("hub"), v.literal("discord"), v.literal("whatsapp"), v.literal("custom")),
  },
  handler: async (ctx, args) => {
    const channels = await ctx.db
      .query("channels")
      .withIndex("by_platform", (q) => q.eq("platform", args.platform))
      .collect();
    return channels.find((c) => c.gatewayId === args.gatewayId) ?? null;
  },
});

export const create = mutation({
  args: {
    gatewayId: v.id("gateways"),
    platform: v.union(v.literal("telegram"), v.literal("hub"), v.literal("discord"), v.literal("whatsapp"), v.literal("custom")),
    name: v.string(),
    agentId: v.id("agents"),
    config: v.any(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("channels", {
      ...args,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("channels"),
    name: v.optional(v.string()),
    agentId: v.optional(v.id("agents")),
    config: v.optional(v.any()),
    isActive: v.optional(v.boolean()),
    enabled: v.optional(v.boolean()),
    responseFormat: v.optional(v.string()),
    maxMessageLength: v.optional(v.number()),
    streamingEnabled: v.optional(v.boolean()),
    typingIndicator: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    await ctx.db.patch(id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("channels") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// --- Channel Users ---

export const upsertChannelUser = mutation({
  args: {
    channelId: v.id("channels"),
    externalUserId: v.string(),
    displayName: v.string(),
    isBot: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("channelUsers")
      .withIndex("by_channel_external", (q) =>
        q.eq("channelId", args.channelId).eq("externalUserId", args.externalUserId)
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: args.displayName,
        lastSeenAt: now,
        messageCount: existing.messageCount + 1,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("channelUsers", {
        channelId: args.channelId,
        externalUserId: args.externalUserId,
        displayName: args.displayName,
        isBot: args.isBot,
        firstSeenAt: now,
        lastSeenAt: now,
        messageCount: 1,
      });
    }
  },
});

// --- New multi-channel functions ---

export const listForGateway = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    const channels = await ctx.db
      .query("channels")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
    return channels.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  },
});

export const createCustom = mutation({
  args: {
    gatewayId: v.id("gateways"),
    name: v.string(),
    agentId: v.id("agents"),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("channels", {
      gatewayId: args.gatewayId,
      platform: "custom",
      name: args.name,
      agentId: args.agentId,
      isActive: true,
      config: {},
      description: args.description,
      icon: args.icon || "💬",
      isPublic: args.isPublic ?? false,
      category: "custom",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateChannel = mutation({
  args: {
    id: v.id("channels"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    await ctx.db.patch(id, updates);
  },
});

export const deleteCustom = mutation({
  args: { id: v.id("channels") },
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.id);
    if (!channel || channel.platform !== "custom") {
      throw new Error("Can only delete custom channels");
    }
    await ctx.db.delete(args.id);
  },
});

export const getPublicMessages = query({
  args: {
    channelId: v.id("channels"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.channelId);
    if (!channel || !channel.isPublic) return [];
    // Find sessions for this channel
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", channel.gatewayId))
      .collect();
    const channelSessions = sessions.filter((s) => s.channelId === args.channelId);
    if (channelSessions.length === 0) return [];
    // Get messages from all sessions in this channel
    const allMessages = [];
    for (const sess of channelSessions) {
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", sess._id))
        .collect();
      allMessages.push(...msgs);
    }
    allMessages.sort((a, b) => a._creationTime - b._creationTime);
    return allMessages.slice(-(args.limit ?? 50));
  },
});

export const listChannelUsers = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("channelUsers")
      .withIndex("by_channel_external", (q) => q.eq("channelId", args.channelId))
      .collect();
  },
});
