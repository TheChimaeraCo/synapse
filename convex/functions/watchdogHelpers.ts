import { internalQuery } from "../_generated/server";

export const getLastAssistantTime = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Find the most recent assistant message across all gateways
    const messages = await ctx.db.query("messages").order("desc").take(50);
    const assistant = messages.find((m) => m.role === "assistant");
    return assistant?._creationTime ?? null;
  },
});

export const getChannelActivity = internalQuery({
  args: {},
  handler: async (ctx) => {
    const channels = await ctx.db.query("channels").collect();
    return channels.map((ch) => ({
      name: ch.name,
      platform: ch.platform,
      isActive: ch.isActive,
      lastActivity: ch.lastActivityAt ?? null,
    }));
  },
});
