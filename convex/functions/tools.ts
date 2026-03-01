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
    providerProfileId: v.optional(v.string()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Upsert - if exists, patch definition.
    const existing = await ctx.db
      .query("tools")
      .withIndex("by_name", (q) => q.eq("gatewayId", args.gatewayId).eq("name", args.name))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        description: args.description,
        category: args.category,
        enabled: args.enabled,
        requiresApproval: args.requiresApproval,
        parameters: args.parameters,
        ...(args.handlerCode !== undefined ? { handlerCode: args.handlerCode } : {}),
        ...(args.providerProfileId !== undefined ? { providerProfileId: args.providerProfileId } : {}),
        ...(args.provider !== undefined ? { provider: args.provider } : {}),
        ...(args.model !== undefined ? { model: args.model } : {}),
      });
      return existing._id;
    }

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
    providerProfileId: v.optional(v.string()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    parameters: v.optional(v.any()),
    handlerCode: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Tool not found");
    const updates: Record<string, any> = {};
    if (fields.enabled !== undefined) updates.enabled = fields.enabled;
    if (fields.requiresApproval !== undefined) updates.requiresApproval = fields.requiresApproval;
    if (fields.providerProfileId !== undefined) updates.providerProfileId = fields.providerProfileId;
    if (fields.provider !== undefined) updates.provider = fields.provider;
    if (fields.model !== undefined) updates.model = fields.model;
    if (fields.description !== undefined) updates.description = fields.description;
    if (fields.category !== undefined) updates.category = fields.category;
    if (fields.parameters !== undefined) updates.parameters = fields.parameters;
    if (fields.handlerCode !== undefined) updates.handlerCode = fields.handlerCode;
    await ctx.db.patch(id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("tools") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
