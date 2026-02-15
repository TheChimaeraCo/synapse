import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const create = mutation({
  args: {
    gatewayId: v.id("gateways"),
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("viewer")),
    maxUses: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    createdBy: v.id("authUsers"),
  },
  handler: async (ctx, args) => {
    const code = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    return await ctx.db.insert("gatewayInvites", {
      gatewayId: args.gatewayId,
      code,
      createdBy: args.createdBy,
      role: args.role,
      maxUses: args.maxUses,
      uses: 0,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("gatewayInvites")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!invite) return null;
    // Check validity
    if (invite.expiresAt && Date.now() > invite.expiresAt) return null;
    if (invite.maxUses && invite.uses >= invite.maxUses) return null;
    return invite;
  },
});

export const use = mutation({
  args: { code: v.string(), userId: v.id("authUsers") },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("gatewayInvites")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!invite) throw new Error("Invalid invite code");
    if (invite.expiresAt && Date.now() > invite.expiresAt) throw new Error("Invite expired");
    if (invite.maxUses && invite.uses >= invite.maxUses) throw new Error("Invite max uses reached");

    // Check not already a member
    const existing = await ctx.db
      .query("gatewayMembers")
      .withIndex("by_gateway_user", (q) => q.eq("gatewayId", invite.gatewayId).eq("userId", args.userId))
      .first();
    if (existing) throw new Error("Already a member");

    // Create membership
    await ctx.db.insert("gatewayMembers", {
      gatewayId: invite.gatewayId,
      userId: args.userId,
      role: invite.role,
      addedBy: invite.createdBy,
      addedAt: Date.now(),
    });

    // Increment uses
    await ctx.db.patch(invite._id, { uses: invite.uses + 1 });
    return invite.gatewayId;
  },
});

export const list = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gatewayInvites")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
  },
});

export const revoke = mutation({
  args: { inviteId: v.id("gatewayInvites") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.inviteId);
  },
});
