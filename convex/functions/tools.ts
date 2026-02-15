import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, { gatewayId }) => {
    return await ctx.db
      .query("tools")
      .withIndex("by_gateway", (q) => q.eq("gatewayId", gatewayId))
      .collect();
  },
});

export const getEnabled = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, { gatewayId }) => {
    const all = await ctx.db
      .query("tools")
      .withIndex("by_gateway", (q) => q.eq("gatewayId", gatewayId))
      .collect();
    return all.filter((t) => t.enabled);
  },
});

export const getByName = query({
  args: { gatewayId: v.id("gateways"), name: v.string() },
  handler: async (ctx, { gatewayId, name }) => {
    return await ctx.db
      .query("tools")
      .withIndex("by_name", (q) => q.eq("gatewayId", gatewayId).eq("name", name))
      .first();
  },
});

export const create = mutation({
  args: {
    gatewayId: v.id("gateways"),
    name: v.string(),
    description: v.string(),
    category: v.string(),
    enabled: v.boolean(),
    requiresApproval: v.boolean(),
    parameters: v.any(),
    handlerCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Upsert - if exists, skip
    const existing = await ctx.db
      .query("tools")
      .withIndex("by_name", (q) => q.eq("gatewayId", args.gatewayId).eq("name", args.name))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("tools", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("tools"),
    enabled: v.optional(v.boolean()),
    requiresApproval: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Tool not found");
    const updates: Record<string, any> = {};
    if (fields.enabled !== undefined) updates.enabled = fields.enabled;
    if (fields.requiresApproval !== undefined) updates.requiresApproval = fields.requiresApproval;
    await ctx.db.patch(id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("tools") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
