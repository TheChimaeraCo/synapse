import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

export const getPending = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("approvals")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId).eq("status", "pending"))
      .collect();
  },
});

export const getBySessionStatus = query({
  args: {
    sessionId: v.id("sessions"),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("denied")),
  },
  handler: async (ctx, { sessionId, status }) => {
    return await ctx.db
      .query("approvals")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId).eq("status", status))
      .collect();
  },
});

export const getPendingForGateway = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, { gatewayId }) => {
    const all = await ctx.db.query("approvals").collect();
    return all.filter((a) => a.gatewayId === gatewayId && a.status === "pending");
  },
});

export const getById = query({
  args: { id: v.id("approvals") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    gatewayId: v.id("gateways"),
    sessionId: v.id("sessions"),
    toolName: v.string(),
    toolArgs: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("approvals", {
      ...args,
      status: "pending",
      requestedAt: Date.now(),
    });
  },
});

export const resolve = mutation({
  args: {
    id: v.id("approvals"),
    status: v.union(v.literal("approved"), v.literal("denied")),
  },
  handler: async (ctx, { id, status }) => {
    await ctx.db.patch(id, { status, resolvedAt: Date.now() });
  },
});
