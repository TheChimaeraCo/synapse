import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const list = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("gatewayMembers")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
    const result = [];
    for (const m of members) {
      const user = await ctx.db.get(m.userId);
      result.push({ ...m, user });
    }
    return result;
  },
});

export const add = mutation({
  args: {
    gatewayId: v.id("gateways"),
    userId: v.id("authUsers"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member"), v.literal("viewer")),
    addedBy: v.optional(v.id("authUsers")),
  },
  handler: async (ctx, args) => {
    // Check if already a member
    const existing = await ctx.db
      .query("gatewayMembers")
      .withIndex("by_gateway_user", (q) => q.eq("gatewayId", args.gatewayId).eq("userId", args.userId))
      .first();
    if (existing) throw new Error("User is already a member of this gateway");

    // Validate member capacity for this instance
    const currentMembers = await ctx.db
      .query("gatewayMembers")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
    const tierConfig = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "license_max_users"))
      .first();
    const maxAllowed = tierConfig ? parseInt(tierConfig.value) : 5;
    if (currentMembers.length >= maxAllowed) {
      throw new Error("Member limit reached for your current plan. Upgrade to add more team members.");
    }

    return await ctx.db.insert("gatewayMembers", {
      gatewayId: args.gatewayId,
      userId: args.userId,
      role: args.role,
      addedBy: args.addedBy,
      addedAt: Date.now(),
    });
  },
});

export const updateRole = mutation({
  args: {
    gatewayId: v.id("gateways"),
    userId: v.id("authUsers"),
    newRole: v.union(v.literal("owner"), v.literal("admin"), v.literal("member"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("gatewayMembers")
      .withIndex("by_gateway_user", (q) => q.eq("gatewayId", args.gatewayId).eq("userId", args.userId))
      .first();
    if (!member) throw new Error("Member not found");
    if (member.role === "owner") throw new Error("Cannot change owner role");
    await ctx.db.patch(member._id, { role: args.newRole });
  },
});

export const remove = mutation({
  args: { gatewayId: v.id("gateways"), userId: v.id("authUsers") },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("gatewayMembers")
      .withIndex("by_gateway_user", (q) => q.eq("gatewayId", args.gatewayId).eq("userId", args.userId))
      .first();
    if (!member) throw new Error("Member not found");
    if (member.role === "owner") throw new Error("Cannot remove owner");
    await ctx.db.delete(member._id);
  },
});

export const getForUser = query({
  args: { userId: v.id("authUsers") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("gatewayMembers")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    const result = [];
    for (const m of memberships) {
      const gateway = await ctx.db.get(m.gatewayId);
      if (gateway) result.push({ ...m, gateway });
    }
    return result;
  },
});

export const getRole = query({
  args: { gatewayId: v.id("gateways"), userId: v.id("authUsers") },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("gatewayMembers")
      .withIndex("by_gateway_user", (q) => q.eq("gatewayId", args.gatewayId).eq("userId", args.userId))
      .first();
    return member?.role ?? null;
  },
});

export const getMembership = query({
  args: { gatewayId: v.id("gateways"), userId: v.id("authUsers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gatewayMembers")
      .withIndex("by_gateway_user", (q) => q.eq("gatewayId", args.gatewayId).eq("userId", args.userId))
      .first();
  },
});
