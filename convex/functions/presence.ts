import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const getState = query({
  args: { gatewayId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("presenceState")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .first();
  },
});

export const updateActivity = mutation({
  args: { gatewayId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("presenceState")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { lastActivity: Date.now() });
    } else {
      await ctx.db.insert("presenceState", {
        gatewayId: args.gatewayId,
        lastActivity: Date.now(),
        activeTopics: [],
        pendingQueue: [],
      });
    }
  },
});

export const queueMessage = mutation({
  args: {
    gatewayId: v.string(),
    message: v.string(),
    priority: v.number(),
    scheduledFor: v.number(),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("presenceState")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .first();

    if (!state) return;

    const queue = [...state.pendingQueue, {
      message: args.message,
      priority: args.priority,
      scheduledFor: args.scheduledFor,
    }];

    await ctx.db.patch(state._id, { pendingQueue: queue });
  },
});

export const drainQueue = query({
  args: { gatewayId: v.string() },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("presenceState")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .first();

    if (!state) return [];

    const now = Date.now();
    return state.pendingQueue.filter((item) => item.scheduledFor <= now);
  },
});

export const isQuietHours = query({
  args: {
    gatewayId: v.string(),
    currentHour: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("presenceState")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .first();

    if (!state || !state.quietHoursStart || !state.quietHoursEnd) return false;

    const start = parseInt(state.quietHoursStart.split(":")[0]);
    const end = parseInt(state.quietHoursEnd.split(":")[0]);
    const hour = args.currentHour ?? new Date().getUTCHours();

    if (start <= end) {
      return hour >= start && hour < end;
    }
    // Wraps midnight
    return hour >= start || hour < end;
  },
});

export const setQuietHours = mutation({
  args: {
    gatewayId: v.string(),
    quietHoursStart: v.string(),
    quietHoursEnd: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("presenceState")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        quietHoursStart: args.quietHoursStart,
        quietHoursEnd: args.quietHoursEnd,
        timezone: args.timezone,
      });
    } else {
      await ctx.db.insert("presenceState", {
        gatewayId: args.gatewayId,
        lastActivity: Date.now(),
        activeTopics: [],
        quietHoursStart: args.quietHoursStart,
        quietHoursEnd: args.quietHoursEnd,
        timezone: args.timezone,
        pendingQueue: [],
      });
    }
  },
});
