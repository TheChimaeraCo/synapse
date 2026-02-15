import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";

// --- Queries ---

export const list = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("heartbeatModules")
      .withIndex("by_gateway", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
  },
});

export const getRuns = query({
  args: { gatewayId: v.id("gateways"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const runs = await ctx.db
      .query("heartbeatRuns")
      .withIndex("by_time", (q) => q.eq("gatewayId", args.gatewayId))
      .order("desc")
      .take(limit);
    return runs;
  },
});

export const getModuleStatus = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    const modules = await ctx.db
      .query("heartbeatModules")
      .withIndex("by_gateway", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
    return modules.map((m) => ({
      _id: m._id,
      name: m.name,
      enabled: m.enabled,
      lastRunAt: m.lastRunAt,
      lastStatus: m.lastStatus,
      lastResult: m.lastResult,
      intervalMinutes: m.intervalMinutes,
    }));
  },
});

export const getCronJobs = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userCronJobs")
      .withIndex("by_gateway", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
  },
});

// --- Mutations ---

export const createModule = mutation({
  args: {
    gatewayId: v.id("gateways"),
    name: v.string(),
    description: v.string(),
    enabled: v.boolean(),
    intervalMinutes: v.number(),
    handler: v.string(),
    config: v.optional(v.any()),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("heartbeatModules", args);
  },
});

export const updateModule = mutation({
  args: {
    id: v.id("heartbeatModules"),
    enabled: v.optional(v.boolean()),
    intervalMinutes: v.optional(v.number()),
    config: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered: any = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) filtered[k] = val;
    }
    await ctx.db.patch(id, filtered);
  },
});

export const deleteModule = mutation({
  args: { id: v.id("heartbeatModules") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const recordRun = internalMutation({
  args: {
    gatewayId: v.id("gateways"),
    startedAt: v.number(),
    completedAt: v.number(),
    modulesRun: v.number(),
    alerts: v.number(),
    results: v.any(),
    triggeredActions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("heartbeatRuns", args);
  },
});

export const updateModuleRun = internalMutation({
  args: {
    id: v.id("heartbeatModules"),
    lastRunAt: v.number(),
    lastResult: v.string(),
    lastStatus: v.union(v.literal("ok"), v.literal("alert"), v.literal("error")),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

export const upsertCronJob = mutation({
  args: {
    id: v.optional(v.id("userCronJobs")),
    gatewayId: v.id("gateways"),
    label: v.string(),
    schedule: v.string(),
    prompt: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (args.id) {
      const { id, ...updates } = args;
      await ctx.db.patch(id, { label: updates.label, schedule: updates.schedule, prompt: updates.prompt, enabled: updates.enabled });
      return id;
    }
    return await ctx.db.insert("userCronJobs", {
      gatewayId: args.gatewayId,
      label: args.label,
      schedule: args.schedule,
      prompt: args.prompt,
      enabled: args.enabled,
      createdAt: Date.now(),
    });
  },
});

export const deleteCronJob = mutation({
  args: { id: v.id("userCronJobs") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const updateCronJobRun = internalMutation({
  args: {
    id: v.id("userCronJobs"),
    lastRunAt: v.number(),
    lastResult: v.optional(v.string()),
    lastStatus: v.union(v.literal("ok"), v.literal("error")),
    nextRunAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered: any = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) filtered[k] = val;
    }
    await ctx.db.patch(id, filtered);
  },
});

export const seedDefaults = mutation({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("heartbeatModules")
      .withIndex("by_gateway", (q) => q.eq("gatewayId", args.gatewayId))
      .first();
    if (existing) return { seeded: false, message: "Modules already exist" };

    const defaults = [
      { name: "system_health", description: "Convex self-ping - confirms backend is responsive", intervalMinutes: 5, handler: "system_health", order: 0 },
      { name: "channel_health", description: "Check active channels and last activity times", intervalMinutes: 15, handler: "channel_health", order: 1 },
      { name: "ai_health", description: "Check last AI response time and errors", intervalMinutes: 15, handler: "ai_health", order: 2 },
      { name: "session_health", description: "Count active sessions, detect stale ones", intervalMinutes: 30, handler: "session_health", order: 3 },
      { name: "usage_check", description: "Compare usage against budget limits", intervalMinutes: 60, handler: "usage_check", order: 4 },
      { name: "knowledge_freshness", description: "Check last knowledge extraction time", intervalMinutes: 120, handler: "knowledge_freshness", order: 5 },
    ];

    for (const mod of defaults) {
      await ctx.db.insert("heartbeatModules", {
        gatewayId: args.gatewayId,
        ...mod,
        enabled: true,
      });
    }

    return { seeded: true, count: defaults.length };
  },
});

// Internal queries for the heartbeat action
export const listEnabled = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    const modules = await ctx.db
      .query("heartbeatModules")
      .withIndex("by_enabled", (q) => q.eq("gatewayId", args.gatewayId).eq("enabled", true))
      .collect();
    return modules.sort((a, b) => a.order - b.order);
  },
});

export const listEnabledCronJobs = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userCronJobs")
      .withIndex("by_enabled", (q) => q.eq("gatewayId", args.gatewayId).eq("enabled", true))
      .collect();
  },
});
