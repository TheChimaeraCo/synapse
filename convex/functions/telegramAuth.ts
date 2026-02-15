import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const checkAccess = query({
  args: { telegramId: v.string() },
  handler: async (ctx, args) => {
    // Check auto-approve config
    const autoApprove = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "telegram_auto_approve"))
      .first();
    if (autoApprove?.value === "true") {
      return { status: "allowed" as const };
    }

    // Check allowlist
    const allowed = await ctx.db
      .query("telegramAllowlist")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    if (allowed) return { status: "allowed" as const };

    // Check blocklist
    const blocked = await ctx.db
      .query("telegramBlocklist")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    if (blocked) return { status: "blocked" as const };

    // Check pending request
    const request = await ctx.db
      .query("telegramAccessRequests")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    if (request && request.status === "pending") return { status: "pending" as const };

    return { status: "unknown" as const };
  },
});

export const createRequest = mutation({
  args: {
    telegramId: v.string(),
    displayName: v.string(),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // No-op if request already exists
    const existing = await ctx.db
      .query("telegramAccessRequests")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("telegramAccessRequests", {
      telegramId: args.telegramId,
      displayName: args.displayName,
      username: args.username,
      status: "pending",
      requestedAt: Date.now(),
    });
  },
});

export const approveRequest = mutation({
  args: { telegramId: v.string() },
  handler: async (ctx, args) => {
    // Update request
    const request = await ctx.db
      .query("telegramAccessRequests")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    if (request) {
      await ctx.db.patch(request._id, {
        status: "approved",
        resolvedAt: Date.now(),
      });
    }

    // Add to allowlist (if not already there)
    const existing = await ctx.db
      .query("telegramAllowlist")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    if (!existing) {
      await ctx.db.insert("telegramAllowlist", {
        telegramId: args.telegramId,
        displayName: request?.displayName || "Unknown",
        username: request?.username,
        approvedAt: Date.now(),
      });
    }

    // If this is the first approved user, set as owner
    const allAllowed = await ctx.db.query("telegramAllowlist").collect();
    if (allAllowed.length <= 1) {
      const ownerConfig = await ctx.db
        .query("systemConfig")
        .withIndex("by_key", (q) => q.eq("key", "telegram_owner_id"))
        .first();
      if (!ownerConfig) {
        await ctx.db.insert("systemConfig", {
          key: "telegram_owner_id",
          value: args.telegramId,
          updatedAt: Date.now(),
        });
      }
    }
  },
});

export const blockRequest = mutation({
  args: { telegramId: v.string() },
  handler: async (ctx, args) => {
    // Update request
    const request = await ctx.db
      .query("telegramAccessRequests")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    if (request) {
      await ctx.db.patch(request._id, {
        status: "blocked",
        resolvedAt: Date.now(),
      });
    }

    // Add to blocklist
    const existing = await ctx.db
      .query("telegramBlocklist")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    if (!existing) {
      await ctx.db.insert("telegramBlocklist", {
        telegramId: args.telegramId,
        displayName: request?.displayName || "Unknown",
        username: request?.username,
        blockedAt: Date.now(),
      });
    }
  },
});

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("telegramAccessRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
  },
});

export const listAllowed = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("telegramAllowlist").collect();
  },
});

export const revokeAccess = mutation({
  args: { telegramId: v.string() },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("telegramAllowlist")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    if (entry) {
      await ctx.db.delete(entry._id);
    }
  },
});

export const listBlocked = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("telegramBlocklist").collect();
  },
});

export const unblock = mutation({
  args: { telegramId: v.string() },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("telegramBlocklist")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    if (entry) {
      await ctx.db.delete(entry._id);
    }
    // Also update request status if exists
    const request = await ctx.db
      .query("telegramAccessRequests")
      .withIndex("by_telegramId", (q) => q.eq("telegramId", args.telegramId))
      .first();
    if (request) {
      await ctx.db.delete(request._id);
    }
  },
});
