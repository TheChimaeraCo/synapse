import { v } from "convex/values";
import { query, mutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

const FILE_REF_RE = /\[file:([^\]:]+):([^\]]+)\]/g;

function extractFileIds(content: string): string[] {
  if (!content || !content.includes("[file:")) return [];
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = FILE_REF_RE.exec(content)) !== null) {
    if (match[1]) ids.push(match[1]);
  }
  FILE_REF_RE.lastIndex = 0;
  return Array.from(new Set(ids));
}

async function syncFileLinksForMessage(
  ctx: any,
  args: {
    gatewayId: any;
    sessionId: any;
    conversationId?: any;
    messageId: any;
    content: string;
  }
) {
  const fileIds = extractFileIds(args.content);
  if (fileIds.length === 0) return;

  for (const fileId of fileIds) {
    try {
      const file = await ctx.db.get(fileId as any);
      if (!file) continue;
      if (String(file.gatewayId) !== String(args.gatewayId)) continue;
      await ctx.db.patch(fileId as any, {
        sessionId: args.sessionId,
        messageId: args.messageId,
        conversationId: args.conversationId,
      });
    } catch {
      // Best effort, continue linking other refs.
    }
  }
}

export const getNextSeq = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const last = await ctx.db
      .query("messages")
      .withIndex("by_session_seq", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .first();
    return (last?.seq ?? 0) + 1;
  },
});

export const getBySeqRange = query({
  args: {
    sessionId: v.id("sessions"),
    startSeq: v.number(),
    endSeq: v.number(),
  },
  handler: async (ctx, args) => {
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_session_seq", (q) =>
        q.eq("sessionId", args.sessionId).gte("seq", args.startSeq)
      )
      .filter((q) => q.lte(q.field("seq"), args.endSeq))
      .order("asc")
      .collect();
    return msgs.map((m) => ({
      _id: m._id,
      role: m.role,
      content: m.content,
      seq: m.seq,
      tokens: m.tokens,
      cost: m.cost,
      model: m.model,
      latencyMs: m.latencyMs,
      _creationTime: m._creationTime,
    }));
  },
});

export const listByConversation = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    // Pull newest N then reverse so callers get chronological order.
    // This is important for topic classification and summarization.
    const desc = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(limit);
    const msgs = desc.reverse();
    return msgs.map((m) => ({
      _id: m._id,
      role: m.role,
      content: m.content,
      seq: m.seq,
      _creationTime: m._creationTime,
    }));
  },
});

export const list = query({
  args: {
    sessionId: v.id("sessions"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const result = await ctx.db
      .query("messages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .paginate({ numItems: limit, cursor: args.cursor ?? null });

    return {
      messages: result.page.map((m) => ({
        _id: m._id,
        role: m.role,
        content: m.content,
        seq: m.seq,
        tokens: m.tokens,
        cost: m.cost,
        model: m.model,
        latencyMs: m.latencyMs,
        conversationId: m.conversationId,
        _creationTime: m._creationTime,
      })),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const getRecent = query({
  args: {
    sessionId: v.id("sessions"),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(args.limit);

    return messages.reverse().map((m) => ({
      _id: m._id,
      role: m.role,
      content: m.content,
      seq: m.seq,
      tokens: m.tokens,
      cost: m.cost,
      model: m.model,
      latencyMs: m.latencyMs,
      conversationId: m.conversationId,
      _creationTime: m._creationTime,
    }));
  },
});

export const create = mutation({
  args: {
    gatewayId: v.id("gateways"),
    sessionId: v.id("sessions"),
    agentId: v.id("agents"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    seq: v.optional(v.number()),
    tokens: v.optional(v.object({ input: v.number(), output: v.number() })),
    cost: v.optional(v.number()),
    model: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
    channelMessageId: v.optional(v.string()),
    conversationId: v.optional(v.id("conversations")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Auto-assign seq if not provided
    let seq = args.seq;
    if (seq === undefined) {
      const last = await ctx.db
        .query("messages")
        .withIndex("by_session_seq", (q) => q.eq("sessionId", args.sessionId))
        .order("desc")
        .first();
      seq = (last?.seq ?? 0) + 1;
    }
    const messageId = await ctx.db.insert("messages", { ...args, seq });
    await syncFileLinksForMessage(ctx, {
      gatewayId: args.gatewayId,
      sessionId: args.sessionId,
      conversationId: args.conversationId,
      messageId,
      content: args.content,
    });
    await ctx.scheduler.runAfter(0, internal.functions.sessions.updateLastMessage, {
      id: args.sessionId,
    });
    return messageId;
  },
});

export const getById = query({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const get = query({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const update = mutation({
  args: {
    id: v.id("messages"),
    content: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const updateConversationId = mutation({
  args: {
    id: v.id("messages"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.id);
    if (!message) return;
    await ctx.db.patch(args.id, { conversationId: args.conversationId });

    const linkedFiles = await ctx.db
      .query("files")
      .withIndex("by_message", (q) => q.eq("messageId", args.id))
      .collect();
    for (const file of linkedFiles) {
      await ctx.db.patch(file._id, { conversationId: args.conversationId });
    }
  },
});

export const clearSession = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    for (const m of msgs) {
      await ctx.db.delete(m._id);
    }
    return msgs.length;
  },
});

export const listByGateway = query({
  args: { gatewayId: v.id("gateways"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 5000;
    return await ctx.db
      .query("messages")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .order("desc")
      .take(limit);
  },
});
