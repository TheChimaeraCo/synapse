import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db.query("scheduledMessages").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).collect();
  },
});

export const listPending = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, { gatewayId }) => {
    const all = await ctx.db.query("scheduledMessages").withIndex("by_gatewayId", (q) => q.eq("gatewayId", gatewayId)).collect();
    return all.filter((m) => m.status === "pending");
  },
});

export const getDue = query({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const pending = await ctx.db.query("scheduledMessages").withIndex("by_status_scheduled", (q) => q.eq("status", "pending")).collect();
    return pending.filter((m) => m.scheduledFor <= now);
  },
});

export const create = mutation({
  args: {
    gatewayId: v.id("gateways"),
    sessionId: v.id("sessions"),
    userId: v.id("authUsers"),
    content: v.string(),
    scheduledFor: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("scheduledMessages", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const cancel = mutation({
  args: { id: v.id("scheduledMessages") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { status: "cancelled" });
  },
});

export const markSent = mutation({
  args: { id: v.id("scheduledMessages") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { status: "sent", sentAt: Date.now() });
  },
});
