import { v } from "convex/values";
import { query } from "../_generated/server";

export const getStats = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    const allMessages = await ctx.db
      .query("messages")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();

    const allSessions = await ctx.db
      .query("sessions")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();

    const today = new Date().toISOString().split("T")[0];
    const usageToday = await ctx.db
      .query("usageRecords")
      .withIndex("by_gatewayId_date", (q) =>
        q.eq("gatewayId", args.gatewayId).eq("date", today)
      )
      .collect();

    const totalCost = allMessages.reduce((s, m) => s + (m.cost ?? 0), 0);
    const activeSessions = allSessions.filter((s) => s.status === "active").length;

    return {
      totalMessages: allMessages.length,
      totalCost,
      totalSessions: allSessions.length,
      activeSessions,
      todayMessages: usageToday.length,
      todayCost: usageToday.reduce((s, r) => s + r.cost, 0),
    };
  },
});

export const getDetailedStats = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    const weekMs = todayMs - 6 * 86400000;
    const monthMs = todayMs - 29 * 86400000;

    const today = new Date().toISOString().split("T")[0];

    // Get all messages for this gateway
    const allMessages = await ctx.db
      .query("messages")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();

    const messagestoday = allMessages.filter((m) => m._creationTime >= todayMs);
    const messagesWeek = allMessages.filter((m) => m._creationTime >= weekMs);
    const messagesMonth = allMessages.filter((m) => m._creationTime >= monthMs);

    // Active sessions
    const allSessions = await ctx.db
      .query("sessions")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
    const activeSessions = allSessions.filter((s) => s.status === "active").length;

    // Avg response time from assistant messages with latencyMs
    const assistantMsgs = allMessages.filter((m) => m.role === "assistant" && m.latencyMs);
    const avgResponseTime = assistantMsgs.length > 0
      ? Math.round(assistantMsgs.reduce((s, m) => s + (m.latencyMs ?? 0), 0) / assistantMsgs.length)
      : 0;

    // Cost periods
    const costToday = messagestoday.reduce((s, m) => s + (m.cost ?? 0), 0);
    const costWeek = messagesWeek.reduce((s, m) => s + (m.cost ?? 0), 0);
    const costMonth = messagesMonth.reduce((s, m) => s + (m.cost ?? 0), 0);

    // Messages per day for last 7 days
    const dailyMessages: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayMs - i * 86400000);
      const dateStr = d.toISOString().split("T")[0];
      const nextDay = todayMs - (i - 1) * 86400000;
      const dayStart = todayMs - i * 86400000;
      const count = allMessages.filter(
        (m) => m._creationTime >= dayStart && m._creationTime < (i === 0 ? now + 1 : nextDay)
      ).length;
      dailyMessages.push({ date: dateStr, count });
    }

    return {
      messagesToday: messagestoday.length,
      messagesWeek: messagesWeek.length,
      messagesMonth: messagesMonth.length,
      activeSessions,
      avgResponseTime,
      costToday,
      costWeek,
      costMonth,
      dailyMessages,
    };
  },
});

export const getRecentActivity = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    // Get recent messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .order("desc")
      .take(20);

    const events = await Promise.all(
      messages.map(async (m) => {
        const session = await ctx.db.get(m.sessionId);
        return {
          id: m._id,
          type: m.role === "assistant" ? "response" : "message" as string,
          content: m.content.slice(0, 100) + (m.content.length > 100 ? "..." : ""),
          role: m.role,
          sessionTitle: session?.title ?? "Untitled",
          sessionId: m.sessionId,
          cost: m.cost,
          latencyMs: m.latencyMs,
          timestamp: m._creationTime,
        };
      })
    );

    return events;
  },
});

export const getSystemHealth = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    // Convex is healthy if we can run this query
    const convexStatus = "healthy" as const;

    // Check AI provider - look at last assistant message
    const lastAssistant = await ctx.db
      .query("messages")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .order("desc")
      .collect()
      .then((msgs) => msgs.find((m) => m.role === "assistant"));

    const aiLastSuccess = lastAssistant?._creationTime ?? null;
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const aiStatus = !aiLastSuccess
      ? ("unknown" as const)
      : aiLastSuccess > fiveMinAgo
        ? ("healthy" as const)
        : aiLastSuccess > oneHourAgo
          ? ("degraded" as const)
          : ("stale" as const);

    // Check channels
    const channels = await ctx.db
      .query("channels")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();

    const channelStatuses = channels.map((ch) => ({
      id: ch._id,
      name: ch.name,
      platform: ch.platform,
      isActive: ch.isActive,
      lastActivity: ch.lastActivityAt ?? null,
    }));

    return {
      convex: convexStatus,
      ai: { status: aiStatus, lastSuccess: aiLastSuccess },
      channels: channelStatuses,
    };
  },
});

export const getRecentSessions = query({
  args: {
    gatewayId: v.id("gateways"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();

    sessions.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    const recent = sessions.slice(0, limit);

    return await Promise.all(
      recent.map(async (s) => {
        const agent = await ctx.db.get(s.agentId);
        const channel = await ctx.db.get(s.channelId);
        // Calculate session cost
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_sessionId", (q) => q.eq("sessionId", s._id))
          .collect();
        const totalCost = messages.reduce((sum, m) => sum + (m.cost ?? 0), 0);
        return {
          _id: s._id,
          title: s.title,
          status: s.status,
          lastMessageAt: s.lastMessageAt,
          messageCount: s.messageCount,
          totalCost,
          agentName: agent?.name ?? "Unknown",
          channelPlatform: channel?.platform ?? "unknown",
        };
      })
    );
  },
});

export const getSessionDetails = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const agent = await ctx.db.get(session.agentId);
    const channel = await ctx.db.get(session.channelId);

    const totalCost = messages.reduce((s, m) => s + (m.cost ?? 0), 0);
    const totalTokens = messages.reduce(
      (s, m) => ({
        input: s.input + (m.tokens?.input ?? 0),
        output: s.output + (m.tokens?.output ?? 0),
      }),
      { input: 0, output: 0 }
    );
    const avgLatency = (() => {
      const withLatency = messages.filter((m) => m.latencyMs);
      return withLatency.length > 0
        ? Math.round(withLatency.reduce((s, m) => s + (m.latencyMs ?? 0), 0) / withLatency.length)
        : null;
    })();

    return {
      _id: session._id,
      title: session.title,
      status: session.status,
      messageCount: session.messageCount,
      lastMessageAt: session.lastMessageAt,
      createdAt: session.createdAt,
      agentName: agent?.name ?? "Unknown",
      agentModel: agent?.model ?? "Unknown",
      channelName: channel?.name ?? "Unknown",
      channelPlatform: channel?.platform ?? "unknown",
      totalCost,
      totalTokens,
      avgLatency,
      messages: messages.map((m) => ({
        _id: m._id,
        role: m.role,
        content: m.content,
        tokens: m.tokens,
        cost: m.cost,
        model: m.model,
        latencyMs: m.latencyMs,
        _creationTime: m._creationTime,
      })),
    };
  },
});
