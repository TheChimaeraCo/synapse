import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";

export const list = query({
  args: {
    gatewayId: v.id("gateways"),
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    let sessions = await ctx.db
      .query("sessions")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();

    if (args.status) {
      sessions = sessions.filter((s) => s.status === args.status);
    }

    sessions.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    sessions = sessions.slice(0, limit);

    // Join agent names and channel platforms
    return await Promise.all(
      sessions.map(async (s) => {
        const agent = await ctx.db.get(s.agentId);
        const channel = await ctx.db.get(s.channelId);
        return {
          _id: s._id,
          title: s.title,
          status: s.status,
          lastMessageAt: s.lastMessageAt,
          messageCount: s.messageCount,
          agentName: agent?.name ?? "Unknown",
          channelId: s.channelId,
          channelPlatform: channel?.platform ?? "unknown",
          externalUserId: s.externalUserId,
        };
      })
    );
  },
});

export const get = query({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listByUser = query({
  args: {
    userId: v.id("authUsers"),
    gatewayId: v.id("gateways"),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const filtered = sessions
      .filter((s) => s.gatewayId === args.gatewayId)
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);

    return await Promise.all(
      filtered.map(async (s) => {
        const agent = await ctx.db.get(s.agentId);
        const channel = await ctx.db.get(s.channelId);
        return {
          _id: s._id,
          title: s.title,
          status: s.status,
          lastMessageAt: s.lastMessageAt,
          messageCount: s.messageCount,
          agentName: agent?.name ?? "Unknown",
          channelId: s.channelId,
          channelPlatform: channel?.platform ?? "unknown",
          externalUserId: s.externalUserId,
        };
      })
    );
  },
});

export const findOrCreate = mutation({
  args: {
    gatewayId: v.id("gateways"),
    agentId: v.id("agents"),
    channelId: v.id("channels"),
    externalUserId: v.string(),
    userId: v.optional(v.id("authUsers")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_channel_externalUser", (q) =>
        q.eq("channelId", args.channelId).eq("externalUserId", args.externalUserId)
      )
      .first();

    if (existing && existing.status === "active") {
      return existing._id;
    }

    return await ctx.db.insert("sessions", {
      gatewayId: args.gatewayId,
      agentId: args.agentId,
      channelId: args.channelId,
      externalUserId: args.externalUserId,
      userId: args.userId,
      status: "active",
      messageCount: 0,
      lastMessageAt: Date.now(),
      createdAt: Date.now(),
    });
  },
});

export const updateMeta = mutation({
  args: {
    id: v.id("sessions"),
    meta: v.any(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) return;
    const existing = (session as any).meta || {};
    await ctx.db.patch(args.id, {
      meta: { ...existing, ...args.meta },
    });
  },
});

export const archive = mutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "archived" });
  },
});

export const updateLastMessage = internalMutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) return;
    await ctx.db.patch(args.id, {
      messageCount: session.messageCount + 1,
      lastMessageAt: Date.now(),
    });
  },
});

export const cleanupStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const staleSessions = await ctx.db
      .query("sessions")
      .withIndex("by_status_lastMessage", (q) =>
        q.eq("status", "active").lt("lastMessageAt", cutoff)
      )
      .collect();

    for (const session of staleSessions) {
      await ctx.db.patch(session._id, { status: "archived" });
    }
  },
});
