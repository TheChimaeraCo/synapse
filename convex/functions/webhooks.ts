import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, { gatewayId }) => {
    return await ctx.db.query("webhooks").withIndex("by_gatewayId", (q) => q.eq("gatewayId", gatewayId)).collect();
  },
});

export const create = mutation({
  args: {
    gatewayId: v.id("gateways"),
    url: v.string(),
    events: v.array(v.string()),
    secret: v.string(),
    enabled: v.boolean(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("webhooks", { ...args, createdAt: now, updatedAt: now });
  },
});

export const update = mutation({
  args: {
    id: v.id("webhooks"),
    url: v.optional(v.string()),
    events: v.optional(v.array(v.string())),
    secret: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    await ctx.db.patch(id, { ...filtered, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("webhooks") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const updateLastTriggered = mutation({
  args: { id: v.id("webhooks"), status: v.number() },
  handler: async (ctx, { id, status }) => {
    await ctx.db.patch(id, { lastTriggeredAt: Date.now(), lastStatus: status });
  },
});

export const getEnabled = query({
  args: { gatewayId: v.id("gateways"), event: v.string() },
  handler: async (ctx, { gatewayId, event }) => {
    const all = await ctx.db.query("webhooks").withIndex("by_gateway_enabled", (q) => q.eq("gatewayId", gatewayId).eq("enabled", true)).collect();
    return all.filter((w) => w.events.includes(event));
  },
});
