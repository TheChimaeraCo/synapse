import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export type Role = "owner" | "admin" | "user" | "viewer";

export const PERMISSIONS = {
  // Settings & config
  "settings.read": ["owner", "admin"],
  "settings.write": ["owner", "admin"],
  // Agent management
  "agents.read": ["owner", "admin", "user", "viewer"],
  "agents.write": ["owner", "admin"],
  // Channel management
  "channels.read": ["owner", "admin", "user", "viewer"],
  "channels.write": ["owner", "admin"],
  // Tools management
  "tools.read": ["owner", "admin", "user", "viewer"],
  "tools.write": ["owner", "admin"],
  // Chat
  "chat.read": ["owner", "admin", "user", "viewer"],
  "chat.write": ["owner", "admin", "user"],
  // Dashboard / analytics
  "dashboard.read": ["owner", "admin", "user", "viewer"],
  // User/role management
  "users.read": ["owner", "admin"],
  "users.manage": ["owner", "admin"],
  "roles.assign": ["owner", "admin"],
  // Audit logs
  "audit.read": ["owner", "admin"],
  // Knowledge
  "knowledge.read": ["owner", "admin", "user", "viewer"],
  "knowledge.write": ["owner", "admin", "user"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const checkPermission = query({
  args: {
    userId: v.id("authUsers"),
    permission: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return false;
    const allowed = (PERMISSIONS as unknown as Record<string, string[]>)[args.permission];
    if (!allowed) return false;
    return allowed.includes(user.role);
  },
});

export const getUserRole = query({
  args: { userId: v.id("authUsers") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user?.role ?? null;
  },
});

export const assignRole = mutation({
  args: {
    actorId: v.id("authUsers"),
    targetUserId: v.id("authUsers"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("user"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    const actor = await ctx.db.get(args.actorId);
    if (!actor || !["owner", "admin"].includes(actor.role)) {
      throw new Error("Insufficient permissions to assign roles");
    }
    // Only owner can promote to owner/admin
    if (["owner", "admin"].includes(args.role) && actor.role !== "owner") {
      throw new Error("Only owners can promote to owner or admin");
    }
    await ctx.db.patch(args.targetUserId, { role: args.role });
    return { success: true };
  },
});

export const listUsers = query({
  args: { gatewayId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.gatewayId) {
      return await ctx.db
        .query("authUsers")
        .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId!))
        .collect();
    }
    return await ctx.db.query("authUsers").collect();
  },
});
