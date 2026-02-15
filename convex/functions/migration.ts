import { v } from "convex/values";
import { mutation } from "../_generated/server";

export const migrateToMultiGateway = mutation({
  args: {},
  handler: async (ctx) => {
    const results = { configsCopied: 0, membersCreated: 0, masterSet: false };

    // Get all gateways
    const gateways = await ctx.db.query("gateways").collect();
    if (gateways.length === 0) return results;

    // Mark first gateway as master if none is master yet
    const hasMaster = gateways.some((g) => g.isMaster === true);
    if (!hasMaster) {
      await ctx.db.patch(gateways[0]._id, { isMaster: true });
      results.masterSet = true;
    }

    // Global keys that stay in systemConfig only
    const globalKeys = new Set(["workspace_path", "vapid_public_key", "vapid_private_key", "setup_complete"]);

    // Copy systemConfig rows to gatewayConfig for each gateway
    const allConfigs = await ctx.db.query("systemConfig").collect();
    for (const gateway of gateways) {
      for (const config of allConfigs) {
        if (globalKeys.has(config.key)) continue;

        // Check if already migrated (idempotent)
        const existing = await ctx.db
          .query("gatewayConfig")
          .withIndex("by_gateway_key", (q) => q.eq("gatewayId", gateway._id).eq("key", config.key))
          .first();
        if (!existing) {
          await ctx.db.insert("gatewayConfig", {
            gatewayId: gateway._id,
            key: config.key,
            value: config.value,
            updatedAt: config.updatedAt,
          });
          results.configsCopied++;
        }
      }
    }

    // Create gatewayMembers from authUsers with gatewayId
    const users = await ctx.db.query("authUsers").collect();
    for (const user of users) {
      if (!user.gatewayId) continue;

      // Find matching gateway by slug or ID
      let gateway = gateways.find((g) => g.slug === user.gatewayId);
      if (!gateway) {
        try {
          gateway = gateways.find((g) => (g._id as string) === user.gatewayId);
        } catch {}
      }
      if (!gateway) continue;

      // Check if membership already exists (idempotent)
      const existing = await ctx.db
        .query("gatewayMembers")
        .withIndex("by_gateway_user", (q) => q.eq("gatewayId", gateway!._id).eq("userId", user._id))
        .first();
      if (!existing) {
        // Map old roles to new roles
        const roleMap: Record<string, "owner" | "admin" | "member" | "viewer"> = {
          owner: "owner",
          admin: "admin",
          user: "member",
          viewer: "viewer",
        };
        await ctx.db.insert("gatewayMembers", {
          gatewayId: gateway._id,
          userId: user._id,
          role: roleMap[user.role] || "member",
          addedAt: Date.now(),
        });
        results.membersCreated++;
      }
    }

    return results;
  },
});
