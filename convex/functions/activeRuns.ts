import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

export const get = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activeRuns")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
  },
});

export const create = mutation({
  args: {
    gatewayId: v.id("gateways"),
    sessionId: v.id("sessions"),
    status: v.union(
      v.literal("thinking"),
      v.literal("streaming"),
      v.literal("complete"),
      v.literal("error")
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("activeRuns", {
      ...args,
      startedAt: now,
      updatedAt: now,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("activeRuns"),
    status: v.union(
      v.literal("thinking"),
      v.literal("streaming"),
      v.literal("complete"),
      v.literal("error")
    ),
    streamedContent: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
  },
});

export const appendStream = mutation({
  args: {
    id: v.id("activeRuns"),
    chunk: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run) return;
    await ctx.db.patch(args.id, {
      streamedContent: (run.streamedContent ?? "") + args.chunk,
      status: "streaming",
      updatedAt: Date.now(),
    });
  },
});

export const complete = mutation({
  args: { id: v.id("activeRuns") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "complete", updatedAt: Date.now() });
    // Delete after 5 seconds
    await ctx.scheduler.runAfter(5000, internal.functions.activeRuns.deleteRun, {
      id: args.id,
    });
  },
});

export const deleteRun = internalMutation({
  args: { id: v.id("activeRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (run) await ctx.db.delete(args.id);
  },
});
