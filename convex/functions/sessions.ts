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

export const rename = mutation({
  args: { id: v.id("sessions"), title: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) throw new Error("Session not found");
    await ctx.db.patch(args.id, { title: args.title });
  },
});

export const deleteSession = mutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) throw new Error("Session not found");
    // Delete all messages in this session
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.id))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }
    // Delete conversations
    const convos = await ctx.db
      .query("conversations")
      .withIndex("by_session", (q) => q.eq("sessionId", args.id))
      .collect();
    for (const c of convos) {
      await ctx.db.delete(c._id);
    }
    await ctx.db.delete(args.id);
  },
});

export const switchAgent = mutation({
  args: { id: v.id("sessions"), agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) throw new Error("Session not found");
    await ctx.db.patch(args.id, { agentId: args.agentId });
  },
});

export const branch = mutation({
  args: {
    sessionId: v.id("sessions"),
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const targetMsg = await ctx.db.get(args.messageId);
    if (!targetMsg || targetMsg.sessionId !== args.sessionId) {
      throw new Error("Message not found in this session");
    }

    // Get all messages up to and including this message (by seq)
    const allMessages = await ctx.db
      .query("messages")
      .withIndex("by_session_seq", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();

    const messagesToCopy = allMessages.filter(
      (m) => m.seq != null && targetMsg.seq != null && m.seq <= targetMsg.seq
    );

    // Create new session
    const now = Date.now();
    const newSessionId = await ctx.db.insert("sessions", {
      gatewayId: session.gatewayId,
      agentId: session.agentId,
      channelId: session.channelId,
      externalUserId: session.externalUserId,
      userId: session.userId,
      title: `${session.title || "Session"} (branch)`,
      status: "active",
      messageCount: messagesToCopy.length,
      lastMessageAt: now,
      createdAt: now,
      meta: { branchedFrom: args.sessionId, branchMessageId: args.messageId },
    });

    // Copy messages
    for (let i = 0; i < messagesToCopy.length; i++) {
      const m = messagesToCopy[i];
      await ctx.db.insert("messages", {
        gatewayId: m.gatewayId,
        sessionId: newSessionId,
        agentId: m.agentId,
        role: m.role,
        content: m.content,
        seq: i + 1,
        tokens: m.tokens,
        cost: m.cost,
        model: m.model,
        latencyMs: m.latencyMs,
        metadata: m.metadata,
      });
    }

    return newSessionId;
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
