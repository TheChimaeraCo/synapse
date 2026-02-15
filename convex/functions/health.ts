import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const recordCheck = mutation({
  args: {
    component: v.string(),
    status: v.union(v.literal("healthy"), v.literal("degraded"), v.literal("down")),
    message: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("healthChecks")
      .withIndex("by_component", (q) => q.eq("component", args.component))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        lastCheck: now,
        lastHealthy: args.status === "healthy" ? now : existing.lastHealthy,
        message: args.message,
        metadata: args.metadata,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("healthChecks", {
        component: args.component,
        status: args.status,
        lastCheck: now,
        lastHealthy: args.status === "healthy" ? now : 0,
        message: args.message,
        metadata: args.metadata,
      });
    }
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("healthChecks").collect();
  },
});

export const getUnhealthy = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("healthChecks").collect();
    return all.filter((h) => h.status !== "healthy");
  },
});

export const getHistory = query({
  args: { component: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // Since we upsert, there's only one record per component.
    // Return the current state. For full history, audit logs could be used.
    const check = await ctx.db
      .query("healthChecks")
      .withIndex("by_component", (q) => q.eq("component", args.component))
      .first();
    return check ? [check] : [];
  },
});
