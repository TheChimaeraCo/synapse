import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";

const MAX_PROMPT_LEN = 220;
const MAX_TOPIC_LEN = 80;
const MAX_TAGS = 8;

function cleanText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, maxLen);
}

function normalizeTags(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const tags = raw
    .map((t) => cleanText(t, 40).toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_TAGS);
  return tags.length ? tags : undefined;
}

export const createMany = mutation({
  args: {
    gatewayId: v.id("gateways"),
    sessionId: v.id("sessions"),
    conversationId: v.optional(v.id("conversations")),
    userId: v.optional(v.id("authUsers")),
    channelId: v.optional(v.id("channels")),
    externalUserId: v.optional(v.string()),
    sourceSummary: v.optional(v.string()),
    items: v.array(v.object({
      topic: v.string(),
      prompt: v.string(),
      dueAt: v.number(),
      confidence: v.optional(v.number()),
      tags: v.optional(v.array(v.string())),
    })),
  },
  handler: async (ctx, args) => {
    if (!args.items.length) return { inserted: 0, skipped: 0 };
    const now = Date.now();

    const existing = await ctx.db
      .query("proactiveFollowups")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(200);
    const dedupe = new Set(
      existing
        .filter((f) => f.status === "open" || f.status === "sent")
        .map((f) => `${(f.prompt || "").toLowerCase()}::${Math.floor((f.dueAt || 0) / 3600000)}`),
    );

    let inserted = 0;
    let skipped = 0;
    for (const item of args.items) {
      const topic = cleanText(item.topic, MAX_TOPIC_LEN);
      const prompt = cleanText(item.prompt, MAX_PROMPT_LEN);
      const dueAt = Number.isFinite(item.dueAt) ? item.dueAt : 0;
      if (!topic || !prompt || dueAt <= now + 60_000) {
        skipped += 1;
        continue;
      }

      const dedupeKey = `${prompt.toLowerCase()}::${Math.floor(dueAt / 3600000)}`;
      if (dedupe.has(dedupeKey)) {
        skipped += 1;
        continue;
      }

      await ctx.db.insert("proactiveFollowups", {
        gatewayId: args.gatewayId,
        sessionId: args.sessionId,
        conversationId: args.conversationId,
        userId: args.userId,
        channelId: args.channelId,
        externalUserId: args.externalUserId,
        topic,
        prompt,
        dueAt,
        tags: normalizeTags(item.tags),
        confidence: typeof item.confidence === "number"
          ? Math.max(0, Math.min(1, item.confidence))
          : undefined,
        status: "open",
        attempts: 0,
        sourceSummary: cleanText(args.sourceSummary, 600),
        createdAt: now,
        updatedAt: now,
      });
      dedupe.add(dedupeKey);
      inserted += 1;
    }

    return { inserted, skipped };
  },
});

export const listDueByGateway = query({
  args: {
    gatewayId: v.id("gateways"),
    now: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(100, args.limit ?? 30));
    const rows = await ctx.db
      .query("proactiveFollowups")
      .withIndex("by_gateway", (q) => q.eq("gatewayId", args.gatewayId).lte("dueAt", args.now))
      .order("asc")
      .take(limit * 3);
    return rows
      .filter((r) => r.status === "open")
      .slice(0, limit);
  },
});

export const getSessionRecentSent = query({
  args: {
    sessionId: v.id("sessions"),
    since: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit ?? 80));
    const rows = await ctx.db
      .query("proactiveFollowups")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(limit);

    return rows
      .filter((row) => typeof row.sentAt === "number" && row.sentAt >= args.since)
      .map((row) => ({
        _id: row._id,
        sentAt: row.sentAt as number,
        status: row.status,
      }));
  },
});

export const markSent = mutation({
  args: {
    id: v.id("proactiveFollowups"),
    proactiveMessageId: v.optional(v.id("messages")),
    sentAt: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return false;
    await ctx.db.patch(args.id, {
      status: "sent",
      sentAt: args.sentAt,
      lastAttemptAt: args.sentAt,
      attempts: (row.attempts || 0) + 1,
      proactiveMessageId: args.proactiveMessageId,
      updatedAt: Date.now(),
      lastError: undefined,
    });
    return true;
  },
});

export const markFailed = mutation({
  args: {
    id: v.id("proactiveFollowups"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return false;
    const attempts = (row.attempts || 0) + 1;
    await ctx.db.patch(args.id, {
      attempts,
      lastAttemptAt: Date.now(),
      lastError: cleanText(args.error, 500),
      status: attempts >= 3 ? "cancelled" : row.status,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const listForGateway = query({
  args: {
    gatewayId: v.id("gateways"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, args.limit ?? 100));
    return await ctx.db
      .query("proactiveFollowups")
      .withIndex("by_gateway", (q) => q.eq("gatewayId", args.gatewayId))
      .order("desc")
      .take(limit);
  },
});

export const completeOnUserReply = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    repliedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("proactiveFollowups")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(40);

    let completed = 0;
    for (const row of rows) {
      if (row.status !== "sent" || !row.sentAt) continue;
      if (args.repliedAt < row.sentAt) continue;
      if (args.repliedAt - row.sentAt > 7 * 24 * 60 * 60 * 1000) continue;
      await ctx.db.patch(row._id, {
        status: "completed",
        respondedAt: args.repliedAt,
        updatedAt: Date.now(),
      });
      completed += 1;
    }
    return completed;
  },
});
