import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

export const getCached = query({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("responseCache")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .first();

    if (!row) return null;

    // Check TTL
    if (Date.now() - row.createdAt > (row.ttlMs || DEFAULT_TTL_MS)) {
      return null; // expired
    }

    return {
      response: row.response,
      model: row.model,
      tokens: row.tokens,
      cost: row.cost,
    };
  },
});

export const setCache = mutation({
  args: {
    hash: v.string(),
    response: v.string(),
    model: v.string(),
    tokens: v.object({ input: v.number(), output: v.number() }),
    cost: v.number(),
    ttlMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Upsert
    const existing = await ctx.db
      .query("responseCache")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .first();

    if (existing) {
      await ctx.db.replace(existing._id, {
        ...args,
        createdAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("responseCache", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// Cleanup expired entries (call periodically)
export const cleanExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const all = await ctx.db.query("responseCache").collect();
    let deleted = 0;
    for (const row of all) {
      if (now - row.createdAt > (row.ttlMs || DEFAULT_TTL_MS)) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }
    return { deleted };
  },
});
