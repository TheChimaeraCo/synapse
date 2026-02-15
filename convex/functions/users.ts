import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const normalized = args.email.trim().toLowerCase();
    return await ctx.db
      .query("authUsers")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();
  },
});

export const create = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    role: v.optional(v.union(v.literal("owner"), v.literal("admin"), v.literal("user"), v.literal("viewer"))),
    gatewayId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("authUsers", {
      email: args.email.trim().toLowerCase(),
      name: args.name,
      passwordHash: args.passwordHash,
      role: args.role ?? "user",
      gatewayId: args.gatewayId,
    });
  },
});

export const get = query({
  args: { id: v.id("authUsers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const updateGatewayId = mutation({
  args: {
    id: v.id("authUsers"),
    gatewayId: v.id("gateways"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { gatewayId: args.gatewayId as string });
  },
});

export const setGlobalAdmin = mutation({
  args: {
    id: v.id("authUsers"),
    isGlobalAdmin: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isGlobalAdmin: args.isGlobalAdmin });
  },
});

export const updateProfile = mutation({
  args: {
    id: v.id("authUsers"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(id, updates);
    }
  },
});
