import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const send = mutation({
  args: {
    fromGatewayId: v.id("gateways"),
    toGatewayId: v.id("gateways"),
    fromAgentId: v.id("agents"),
    toAgentId: v.optional(v.id("agents")),
    content: v.string(),
    type: v.union(v.literal("request"), v.literal("response"), v.literal("broadcast")),
    replyTo: v.optional(v.id("agentMessages")),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("agentMessages", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
    });
    return id;
  },
});

export const listInbox = query({
  args: {
    gatewayId: v.id("gateways"),
    status: v.optional(v.union(v.literal("pending"), v.literal("read"), v.literal("replied"))),
  },
  handler: async (ctx, args) => {
    const status = args.status || "pending";
    return await ctx.db
      .query("agentMessages")
      .withIndex("by_to", (q) => q.eq("toGatewayId", args.gatewayId).eq("status", status))
      .order("desc")
      .take(50);
  },
});

export const markRead = mutation({
  args: {
    messageId: v.id("agentMessages"),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) throw new Error("Message not found");
    await ctx.db.patch(args.messageId, { status: "read" });
  },
});

export const reply = mutation({
  args: {
    originalMessageId: v.id("agentMessages"),
    fromGatewayId: v.id("gateways"),
    fromAgentId: v.id("agents"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const original = await ctx.db.get(args.originalMessageId);
    if (!original) throw new Error("Original message not found");

    // Mark original as replied
    await ctx.db.patch(args.originalMessageId, { status: "replied" });

    // Send reply
    const id = await ctx.db.insert("agentMessages", {
      fromGatewayId: args.fromGatewayId,
      toGatewayId: original.fromGatewayId,
      fromAgentId: args.fromAgentId,
      toAgentId: original.fromAgentId,
      content: args.content,
      type: "response",
      status: "pending",
      replyTo: args.originalMessageId,
      createdAt: Date.now(),
    });
    return id;
  },
});
