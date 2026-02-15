import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const getBreaker = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("circuitBreakers")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("circuitBreakers").collect();
  },
});

export const recordSuccess = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const breaker = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (!breaker) return;
    await ctx.db.patch(breaker._id, {
      failures: 0,
      state: "closed",
      lastSuccess: Date.now(),
    });
  },
});

export const recordFailure = mutation({
  args: { name: v.string(), threshold: v.optional(v.number()), resetAfterMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    let breaker = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (!breaker) {
      const id = await ctx.db.insert("circuitBreakers", {
        name: args.name,
        state: "closed",
        failures: 1,
        lastFailure: now,
        threshold: args.threshold ?? 5,
        resetAfterMs: args.resetAfterMs ?? 60000,
      });
      return;
    }

    const newFailures = breaker.failures + 1;
    const newState = newFailures >= breaker.threshold ? "open" : breaker.state;
    await ctx.db.patch(breaker._id, {
      failures: newFailures,
      state: newState as "closed" | "open" | "half-open",
      lastFailure: now,
    });
  },
});

export const attemptReset = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const breaker = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (!breaker || breaker.state !== "open") return;
    const elapsed = Date.now() - (breaker.lastFailure ?? 0);
    if (elapsed >= breaker.resetAfterMs) {
      await ctx.db.patch(breaker._id, { state: "half-open" });
    }
  },
});

export const tripBreaker = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const breaker = await ctx.db
      .query("circuitBreakers")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (!breaker) return;
    await ctx.db.patch(breaker._id, { state: "open", lastFailure: Date.now() });
  },
});
