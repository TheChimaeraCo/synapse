import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { cacheKey: v.string() },
  handler: async (ctx, { cacheKey }) => {
    const entry = await ctx.db
      .query("toolCache")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", cacheKey))
      .first();
    if (!entry) return null;
    // Check TTL
    if (Date.now() - entry.createdAt > entry.ttlMs) {
      return null; // Expired
    }
    return entry;
  },
});

export const set = mutation({
  args: {
    cacheKey: v.string(),
    toolName: v.string(),
    inputHash: v.string(),
    result: v.string(),
    ttlMs: v.number(),
  },
  handler: async (ctx, args) => {
    // Remove existing entry if any
    const existing = await ctx.db
      .query("toolCache")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", args.cacheKey))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return await ctx.db.insert("toolCache", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("toolCache").collect();
    for (const entry of all) {
      await ctx.db.delete(entry._id);
    }
    return { deleted: all.length };
  },
});

export const clearByTool = mutation({
  args: { toolName: v.string() },
  handler: async (ctx, { toolName }) => {
    const entries = await ctx.db
      .query("toolCache")
      .withIndex("by_toolName", (q) => q.eq("toolName", toolName))
      .collect();
    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }
    return { deleted: entries.length };
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("toolCache").collect();
    const now = Date.now();
    const active = all.filter(e => now - e.createdAt <= e.ttlMs);
    const byTool: Record<string, number> = {};
    for (const e of active) {
      byTool[e.toolName] = (byTool[e.toolName] || 0) + 1;
    }
    return { total: all.length, active: active.length, expired: all.length - active.length, byTool };
  },
});
