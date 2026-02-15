"use node";
import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";

export const runHealthCheck = internalAction({
  args: {},
  handler: async (ctx) => {
    const results: Record<string, string> = {};

    // 1. Self-ping (Convex is alive if we got here)
    try {
      await ctx.runMutation(api.functions.health.recordCheck, {
        component: "convex",
        status: "healthy",
        message: "Convex backend responding",
      });
      results.convex = "healthy";
    } catch (e: any) {
      results.convex = `error: ${e.message}`;
    }

    // 2. Check last AI response freshness
    try {
      const messages = await ctx.runQuery(api.functions.messages.list as any, { limit: 1 });
      const lastMsg = Array.isArray(messages) && messages.length > 0 ? messages[0] : null;
      const age = lastMsg ? Date.now() - (lastMsg as any)._creationTime : Infinity;
      const aiStatus = age < 3600000 ? "healthy" : age < 86400000 ? "degraded" : "down";
      await ctx.runMutation(api.functions.health.recordCheck, {
        component: "ai-responses",
        status: aiStatus,
        message: lastMsg ? `Last message ${Math.round(age / 60000)}m ago` : "No messages found",
      });
      results.ai = aiStatus;
    } catch (e: any) {
      await ctx.runMutation(api.functions.health.recordCheck, {
        component: "ai-responses",
        status: "degraded",
        message: `Check failed: ${e.message}`,
      });
      results.ai = "degraded";
    }

    // 3. Check channels
    try {
      const channels = await ctx.runQuery(api.functions.channels.list as any, {});
      const channelList = Array.isArray(channels) ? channels : [];
      const activeCount = channelList.filter((c: any) => c.isActive).length;
      await ctx.runMutation(api.functions.health.recordCheck, {
        component: "channels",
        status: activeCount > 0 ? "healthy" : "degraded",
        message: `${activeCount}/${channelList.length} channels active`,
      });
      results.channels = activeCount > 0 ? "healthy" : "degraded";
    } catch (e: any) {
      await ctx.runMutation(api.functions.health.recordCheck, {
        component: "channels",
        status: "degraded",
        message: `Channel check failed: ${e.message}`,
      });
      results.channels = "degraded";
    }

    // Create notification for any unhealthy components
    const unhealthy = Object.entries(results).filter(([, s]) => s !== "healthy");
    if (unhealthy.length > 0) {
      await ctx.runMutation(api.functions.notifications.create, {
        type: unhealthy.some(([, s]) => s === "down" || s.startsWith("error")) ? "critical" : "warning",
        title: "Health Check Alert",
        message: unhealthy.map(([c, s]) => `${c}: ${s}`).join(", "),
      });
    }

    return results;
  },
});
