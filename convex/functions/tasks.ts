import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const list = query({
  args: { gatewayId: v.string(), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_gatewayId_status", (q) =>
          q.eq("gatewayId", args.gatewayId).eq("status", args.status as any)
        )
        .collect();
    }
    return await ctx.db
      .query("tasks")
      .withIndex("by_gatewayId_status", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const getUpcoming = query({
  args: { gatewayId: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const daysAhead = args.days ?? 7;
    const cutoff = Date.now() + daysAhead * 86400000;
    const all = await ctx.db
      .query("tasks")
      .withIndex("by_gatewayId_status", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
    return all
      .filter((t) => t.dueDate && t.dueDate <= cutoff && t.status !== "done")
      .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    description: v.string(),
    status: v.union(v.literal("todo"), v.literal("in_progress"), v.literal("blocked"), v.literal("done")),
    priority: v.number(),
    assignee: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    gatewayId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tasks", { ...args, createdAt: Date.now() });
  },
});

export const update = mutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.union(v.literal("todo"), v.literal("in_progress"), v.literal("blocked"), v.literal("done"))),
    priority: v.optional(v.number()),
    assignee: v.optional(v.string()),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const patch: any = { ...fields };
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
    if (patch.status === "done") patch.completedAt = Date.now();
    await ctx.db.patch(id, patch);
  },
});

export const complete = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "done", completedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
