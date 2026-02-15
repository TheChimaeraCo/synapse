import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const get = query({
  args: { id: v.id("gateways") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gateways")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("gateways").collect();
  },
});

export const getByUser = query({
  args: { userId: v.id("authUsers") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return [];
    // Owner/admin can see all gateways
    if (user.role === "owner" || user.role === "admin") {
      return await ctx.db.query("gateways").collect();
    }
    // Regular users see only their gateway
    if (user.gatewayId) {
      const gw = await ctx.db
        .query("gateways")
        .withIndex("by_slug", (q) => q.eq("slug", user.gatewayId))
        .first();
      // Also try by ID directly
      if (!gw) {
        try {
          const gwById = await ctx.db.get(user.gatewayId as any);
          return gwById ? [gwById] : [];
        } catch {
          return [];
        }
      }
      return gw ? [gw] : [];
    }
    return [];
  },
});

export const getStats = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
    return {
      agentCount: agents.length,
      messageCount: messages.length,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    ownerId: v.id("authUsers"),
    isMaster: v.optional(v.boolean()),
    workspacePath: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check slug uniqueness
    const existing = await ctx.db
      .query("gateways")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existing) throw new Error("Gateway slug already exists");

    // Validate gateway capacity
    const allGateways = await ctx.db.query("gateways").collect();
    const gwLimit = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "license_max_gateways"))
      .first();
    const maxGateways = gwLimit ? parseInt(gwLimit.value) : 1;
    if (allGateways.length >= maxGateways) {
      throw new Error("Gateway limit reached for your current plan. Upgrade to create more gateways.");
    }

    const now = Date.now();
    const { isMaster, workspacePath, description, icon, ...rest } = args;
    const gatewayId = await ctx.db.insert("gateways", {
      ...rest,
      status: "active",
      isMaster: isMaster,
      workspacePath: workspacePath,
      description: description,
      icon: icon,
      createdAt: now,
      updatedAt: now,
    });

    // Create default agent
    await ctx.db.insert("agents", {
      gatewayId,
      name: "Default Agent",
      slug: "default",
      model: "gpt-4o-mini",
      systemPrompt: "You are a helpful assistant.",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // Auto-create owner membership
    await ctx.db.insert("gatewayMembers", {
      gatewayId,
      userId: args.ownerId,
      role: "owner",
      addedAt: now,
    });

    return gatewayId;
  },
});

export const listForUser = query({
  args: { userId: v.id("authUsers") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("gatewayMembers")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    const result = [];
    for (const m of memberships) {
      const gateway = await ctx.db.get(m.gatewayId);
      if (gateway) result.push({ ...gateway, role: m.role });
    }
    return result;
  },
});

export const getMaster = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("gateways").collect();
    return all.find((g) => g.isMaster === true) ?? null;
  },
});

export const update = mutation({
  args: {
    id: v.id("gateways"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("paused"))),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Gateway not found");

    if (updates.slug && updates.slug !== existing.slug) {
      const slugTaken = await ctx.db
        .query("gateways")
        .withIndex("by_slug", (q) => q.eq("slug", updates.slug!))
        .first();
      if (slugTaken) throw new Error("Slug already taken");
    }

    const filtered: Record<string, any> = { updatedAt: Date.now() };
    if (updates.name !== undefined) filtered.name = updates.name;
    if (updates.slug !== undefined) filtered.slug = updates.slug;
    if (updates.status !== undefined) filtered.status = updates.status;

    await ctx.db.patch(id, filtered);
  },
});

export const remove = mutation({
  args: { id: v.id("gateways") },
  handler: async (ctx, args) => {
    const gateway = await ctx.db.get(args.id);
    if (!gateway) throw new Error("Gateway not found");

    // Cascade delete: agents
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.id))
      .collect();
    for (const agent of agents) {
      await ctx.db.delete(agent._id);
    }

    // Cascade: sessions
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.id))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    // Cascade: messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.id))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    // Cascade: gatewayConfig
    const gwConfigs = await ctx.db
      .query("gatewayConfig")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.id))
      .collect();
    for (const cfg of gwConfigs) {
      await ctx.db.delete(cfg._id);
    }

    // Cascade: gatewayMembers
    const gwMembers = await ctx.db
      .query("gatewayMembers")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.id))
      .collect();
    for (const m of gwMembers) {
      await ctx.db.delete(m._id);
    }

    // Cascade: gatewayInvites
    const gwInvites = await ctx.db
      .query("gatewayInvites")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.id))
      .collect();
    for (const inv of gwInvites) {
      await ctx.db.delete(inv._id);
    }

    // Cascade: channels
    const channels = await ctx.db
      .query("channels")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.id))
      .collect();
    for (const ch of channels) {
      await ctx.db.delete(ch._id);
    }

    // Cascade: knowledge
    const knowledge = await ctx.db.query("knowledge").collect();
    for (const k of knowledge) {
      if ((k as any).gatewayId === args.id) await ctx.db.delete(k._id);
    }

    // Cascade: tools
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_gateway", (q) => q.eq("gatewayId", args.id))
      .collect();
    for (const t of tools) {
      await ctx.db.delete(t._id);
    }

    // Cascade: usage
    const usage = await ctx.db
      .query("usageRecords")
      .withIndex("by_gatewayId_date", (q) => q.eq("gatewayId", args.id))
      .collect();
    for (const u of usage) {
      await ctx.db.delete(u._id);
    }

    const budgets = await ctx.db
      .query("usageBudgets")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.id))
      .collect();
    for (const b of budgets) {
      await ctx.db.delete(b._id);
    }

    await ctx.db.delete(args.id);
  },
});
