import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const create = mutation({
  args: {
    parentSessionId: v.id("sessions"),
    gatewayId: v.id("gateways"),
    label: v.string(),
    task: v.optional(v.string()),
    model: v.optional(v.string()),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("workerAgents", {
      ...args,
      status: "running",
      startedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("workerAgents"),
    status: v.optional(v.string()),
    tokens: v.optional(v.object({ input: v.number(), output: v.number() })),
    cost: v.optional(v.number()),
    result: v.optional(v.string()),
    context: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const clean = Object.fromEntries(Object.entries(fields).filter(([_, v]) => v !== undefined));
    if (Object.keys(clean).length > 0) {
      await ctx.db.patch(id, clean);
    }
  },
});

export const complete = mutation({
  args: {
    id: v.id("workerAgents"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    tokens: v.optional(v.object({ input: v.number(), output: v.number() })),
    cost: v.optional(v.number()),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, completedAt: Date.now() });
  },
});

export const appendLog = mutation({
  args: { id: v.id("workerAgents"), entry: v.string() },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.id);
    if (!agent) return;
    const logs = agent.logs || [];
    logs.push(`[${new Date().toISOString()}] ${args.entry}`);
    // Keep last 100 logs
    if (logs.length > 100) logs.splice(0, logs.length - 100);
    await ctx.db.patch(args.id, { logs });
  },
});

export const listAll = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const all = await ctx.db.query("workerAgents").order("desc").take(limit);
    return all;
  },
});

export const getBySession = query({
  args: { parentSessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("workerAgents")
      .withIndex("by_session", (q) => q.eq("parentSessionId", args.parentSessionId))
      .collect();
    return agents.sort((a, b) => b.startedAt - a.startedAt);
  },
});

export const getActive = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workerAgents")
      .withIndex("by_gateway_status", (q) => q.eq("gatewayId", args.gatewayId).eq("status", "running"))
      .collect();
  },
});

export const getRecent = query({
  args: { gatewayId: v.id("gateways"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    const cutoff = Date.now() - 3600000;
    const all = await ctx.db
      .query("workerAgents")
      .withIndex("by_gateway_status", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
    return all
      .filter((a) => a.status === "running" || a.startedAt > cutoff)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  },
});

export const getRecentByUser = query({
  args: { userId: v.id("authUsers"), gatewayId: v.id("gateways"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    const cutoff = Date.now() - 3600000;

    // Get this user's sessions
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
    const userSessionIds = new Set(
      sessions.filter((s) => s.userId === args.userId).map((s) => s._id)
    );

    if (userSessionIds.size === 0) return [];

    // Get workers for those sessions only
    const all = await ctx.db
      .query("workerAgents")
      .withIndex("by_gateway_status", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();

    return all
      .filter((a) => userSessionIds.has(a.parentSessionId) && (a.status === "running" || a.startedAt > cutoff))
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  },
});

export const getSessionSummary = query({
  args: { parentSessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("workerAgents")
      .withIndex("by_session", (q) => q.eq("parentSessionId", args.parentSessionId))
      .collect();

    let totalInput = 0, totalOutput = 0, totalCost = 0;
    for (const a of agents) {
      if (a.tokens) { totalInput += a.tokens.input; totalOutput += a.tokens.output; }
      if (a.cost) totalCost += a.cost;
    }

    return {
      count: agents.length,
      tokens: { input: totalInput, output: totalOutput, total: totalInput + totalOutput },
      cost: totalCost,
    };
  },
});
