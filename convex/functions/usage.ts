import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const record = mutation({
  args: {
    gatewayId: v.id("gateways"),
    agentId: v.id("agents"),
    sessionId: v.optional(v.id("sessions")),
    messageId: v.optional(v.id("messages")),
    userId: v.optional(v.id("authUsers")),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cost: v.number(),
  },
  handler: async (ctx, args) => {
    const date = new Date().toISOString().split("T")[0];
    return await ctx.db.insert("usageRecords", { ...args, date });
  },
});

export const getTodaySummary = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split("T")[0];
    const records = await ctx.db
      .query("usageRecords")
      .withIndex("by_gatewayId_date", (q) =>
        q.eq("gatewayId", args.gatewayId).eq("date", today)
      )
      .collect();

    return {
      totalInputTokens: records.reduce((s, r) => s + r.inputTokens, 0),
      totalOutputTokens: records.reduce((s, r) => s + r.outputTokens, 0),
      totalCost: records.reduce((s, r) => s + r.cost, 0),
      messageCount: records.length,
      period: "today",
    };
  },
});

export const getDateRange = query({
  args: {
    gatewayId: v.id("gateways"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("usageRecords")
      .withIndex("by_gatewayId_date", (q) =>
        q.eq("gatewayId", args.gatewayId).gte("date", args.startDate).lte("date", args.endDate)
      )
      .collect();

    return {
      totalInputTokens: records.reduce((s, r) => s + r.inputTokens, 0),
      totalOutputTokens: records.reduce((s, r) => s + r.outputTokens, 0),
      totalCost: records.reduce((s, r) => s + r.cost, 0),
      messageCount: records.length,
      period: `${args.startDate}_${args.endDate}`,
    };
  },
});

export const checkBudget = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    const budgets = await ctx.db
      .query("usageBudgets")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();

    if (budgets.length === 0) return { allowed: true as const };

    const today = new Date().toISOString().split("T")[0];
    const todayRecords = await ctx.db
      .query("usageRecords")
      .withIndex("by_gatewayId_date", (q) =>
        q.eq("gatewayId", args.gatewayId).eq("date", today)
      )
      .collect();
    const todaySpend = todayRecords.reduce((s, r) => s + r.cost, 0);

    const dailyBudget = budgets.find((b) => b.period === "daily");
    if (dailyBudget && todaySpend >= dailyBudget.limitUsd) {
      if (dailyBudget.action === "block") {
        return {
          allowed: false as const,
          reason: `Daily budget exceeded ($${todaySpend.toFixed(4)} / $${dailyBudget.limitUsd.toFixed(2)})`,
          dailySpend: todaySpend,
          dailyLimit: dailyBudget.limitUsd,
        };
      }
    }

    // Check monthly
    const monthPrefix = today.slice(0, 7);
    const monthStart = `${monthPrefix}-01`;
    const monthEnd = `${monthPrefix}-31`;
    const monthRecords = await ctx.db
      .query("usageRecords")
      .withIndex("by_gatewayId_date", (q) =>
        q.eq("gatewayId", args.gatewayId).gte("date", monthStart).lte("date", monthEnd)
      )
      .collect();
    const monthSpend = monthRecords.reduce((s, r) => s + r.cost, 0);

    const monthlyBudget = budgets.find((b) => b.period === "monthly");

    if (monthlyBudget && monthSpend >= monthlyBudget.limitUsd) {
      if (monthlyBudget.action === "block") {
        return {
          allowed: false as const,
          reason: `Monthly budget exceeded ($${monthSpend.toFixed(4)} / $${monthlyBudget.limitUsd.toFixed(2)})`,
          monthlySpend: monthSpend,
          monthlyLimit: monthlyBudget.limitUsd,
        };
      }
    }

    // If over 80% of monthly, suggest cheaper model
    let suggestedModel: string | undefined;
    if (monthlyBudget && monthSpend >= monthlyBudget.limitUsd * 0.8) {
      suggestedModel = "claude-haiku-3-20250514";
    }

    const remaining = Math.min(
      dailyBudget ? dailyBudget.limitUsd - todaySpend : Infinity,
      monthlyBudget ? monthlyBudget.limitUsd - monthSpend : Infinity,
    );

    return {
      allowed: true as const,
      remainingUsd: remaining === Infinity ? undefined : remaining,
      suggestedModel,
      dailySpend: todaySpend,
      dailyLimit: dailyBudget?.limitUsd,
      monthlySpend: monthSpend,
      monthlyLimit: monthlyBudget?.limitUsd,
    };
  },
});

export const getBudget = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("usageBudgets")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
  },
});

export const setBudget = mutation({
  args: {
    gatewayId: v.id("gateways"),
    period: v.union(v.literal("daily"), v.literal("monthly")),
    limitUsd: v.number(),
    action: v.union(v.literal("warn"), v.literal("block")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("usageBudgets")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();

    const match = existing.find((b) => b.period === args.period);
    const now = Date.now();

    if (match) {
      await ctx.db.patch(match._id, {
        limitUsd: args.limitUsd,
        action: args.action,
        updatedAt: now,
      });
      return match._id;
    }

    return await ctx.db.insert("usageBudgets", {
      gatewayId: args.gatewayId,
      period: args.period,
      limitUsd: args.limitUsd,
      action: args.action,
      createdAt: now,
      updatedAt: now,
    });
  },
});
