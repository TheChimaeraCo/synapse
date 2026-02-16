import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const pins = await ctx.db
      .query("messagePins")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Join message content
    return await Promise.all(
      pins.map(async (pin) => {
        const message = await ctx.db.get(pin.messageId);
        return {
          _id: pin._id,
          messageId: pin.messageId,
          note: pin.note,
          createdAt: pin.createdAt,
          message: message
            ? {
                _id: message._id,
                role: message.role,
                content: message.content,
                seq: message.seq,
                _creationTime: message._creationTime,
              }
            : null,
        };
      })
    );
  },
});

export const pin = mutation({
  args: {
    gatewayId: v.id("gateways"),
    sessionId: v.id("sessions"),
    messageId: v.id("messages"),
    userId: v.id("authUsers"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if already pinned
    const existing = await ctx.db
      .query("messagePins")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("messagePins", {
      gatewayId: args.gatewayId,
      sessionId: args.sessionId,
      messageId: args.messageId,
      userId: args.userId,
      note: args.note,
      createdAt: Date.now(),
    });
  },
});

export const unpin = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const pin = await ctx.db
      .query("messagePins")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .first();
    if (pin) await ctx.db.delete(pin._id);
  },
});

export const isMessagePinned = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const pin = await ctx.db
      .query("messagePins")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .first();
    return !!pin;
  },
});
