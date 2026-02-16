import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

export const getByMessage = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    return await ctx.db
      .query("messageReactions")
      .withIndex("by_message", (q) => q.eq("messageId", messageId))
      .collect();
  },
});

export const toggle = mutation({
  args: {
    messageId: v.id("messages"),
    userId: v.id("authUsers"),
    gatewayId: v.id("gateways"),
    emoji: v.string(),
  },
  handler: async (ctx, { messageId, userId, gatewayId, emoji }) => {
    // Check if already reacted with this emoji
    const existing = await ctx.db
      .query("messageReactions")
      .withIndex("by_user_message", (q) => q.eq("userId", userId).eq("messageId", messageId))
      .collect();

    const match = existing.find((r) => r.emoji === emoji);
    if (match) {
      await ctx.db.delete(match._id);
      return { action: "removed" };
    } else {
      await ctx.db.insert("messageReactions", {
        gatewayId,
        messageId,
        userId,
        emoji,
        createdAt: Date.now(),
      });
      return { action: "added" };
    }
  },
});
