import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    gatewayId: v.string(),
    status: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { gatewayId, status, category }) => {
    let results = await ctx.db
      .query("skills")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", gatewayId))
      .collect();
    if (status) results = results.filter((s) => s.status === status);
    if (category) results = results.filter((s) => s.category === category);
    return results;
  },
});

export const getInstalled = query({
  args: { gatewayId: v.string() },
  handler: async (ctx, { gatewayId }) => {
    const all = await ctx.db
      .query("skills")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", gatewayId))
      .collect();
    return all.filter((s) => s.status === "installed");
  },
});

export const install = mutation({
  args: { id: v.id("skills") },
  handler: async (ctx, { id }) => {
    const skill = await ctx.db.get(id);
    if (!skill) throw new Error("Skill not found");
    await ctx.db.patch(id, { status: "installed", installedAt: Date.now() });
  },
});

export const uninstall = mutation({
  args: { id: v.id("skills") },
  handler: async (ctx, { id }) => {
    const skill = await ctx.db.get(id);
    if (!skill) throw new Error("Skill not found");
    await ctx.db.patch(id, { status: "available", installedAt: undefined });
  },
});

export const configure = mutation({
  args: { id: v.id("skills"), config: v.any() },
  handler: async (ctx, { id, config }) => {
    const skill = await ctx.db.get(id);
    if (!skill) throw new Error("Skill not found");
    await ctx.db.patch(id, { config });
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    version: v.string(),
    author: v.string(),
    category: v.string(),
    status: v.string(),
    config: v.optional(v.any()),
    functions: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        parameters: v.string(),
      })
    ),
    triggers: v.optional(
      v.array(
        v.object({
          type: v.string(),
          value: v.string(),
        })
      )
    ),
    gatewayId: v.string(),
  },
  handler: async (ctx, args) => {
    // Upsert by name+gatewayId
    const existing = await ctx.db
      .query("skills")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
    const match = existing.find((s) => s.name === args.name);
    if (match) return match._id;
    return await ctx.db.insert("skills", { ...args });
  },
});

export const remove = mutation({
  args: { id: v.id("skills") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
