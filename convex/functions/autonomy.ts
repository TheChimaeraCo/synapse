import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { decodeConfigForRead, encodeConfigForStorage } from "../lib/configCrypto";

const DEFAULTS = {
  enabled: false,
  maxDispatchPerTick: 2,
  maxActiveWorkers: 4,
  taskDueWindowHours: 72,
  dispatchCooldownMinutes: 10,
  requireCleanApprovalQueue: false,
  channelPlatform: "hub",
  externalUserId: "autonomy:orchestrator",
  agentId: "",
};

async function getGatewayConfigValue(
  ctx: any,
  gatewayId: string,
  key: string,
): Promise<string | null> {
  const row = await ctx.db
    .query("gatewayConfig")
    .withIndex("by_gateway_key", (q: any) => q.eq("gatewayId", gatewayId).eq("key", key))
    .first();
  if (row) return await decodeConfigForRead(key, row.value);

  const master = (await ctx.db.query("gateways").collect()).find((g: any) => g.isMaster === true);
  if (master && master._id !== gatewayId) {
    const masterRow = await ctx.db
      .query("gatewayConfig")
      .withIndex("by_gateway_key", (q: any) => q.eq("gatewayId", master._id).eq("key", key))
      .first();
    if (masterRow) return await decodeConfigForRead(key, masterRow.value);
  }
  return null;
}

async function setGatewayConfigValue(
  ctx: any,
  gatewayId: string,
  key: string,
  value: string,
) {
  const encoded = await encodeConfigForStorage(key, value);
  const existing = await ctx.db
    .query("gatewayConfig")
    .withIndex("by_gateway_key", (q: any) => q.eq("gatewayId", gatewayId).eq("key", key))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, { value: encoded, updatedAt: Date.now() });
    return;
  }

  await ctx.db.insert("gatewayConfig", {
    gatewayId,
    key,
    value: encoded,
    updatedAt: Date.now(),
  });
}

function parseBool(value: string | null, fallback: boolean): boolean {
  if (!value) return fallback;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

function parseNumber(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value || "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export const getState = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    const gatewayId = String(args.gatewayId);

    const [
      enabledRaw,
      maxDispatchRaw,
      maxWorkersRaw,
      dueWindowRaw,
      cooldownRaw,
      requireCleanRaw,
      platformRaw,
      externalUserRaw,
      agentIdRaw,
      lastDispatchRaw,
      lastTickRaw,
      tasks,
      activeWorkers,
      approvals,
      sessions,
    ] = await Promise.all([
      getGatewayConfigValue(ctx, gatewayId, "autonomy.enabled"),
      getGatewayConfigValue(ctx, gatewayId, "autonomy.max_dispatch_per_tick"),
      getGatewayConfigValue(ctx, gatewayId, "autonomy.max_active_workers"),
      getGatewayConfigValue(ctx, gatewayId, "autonomy.task_due_window_hours"),
      getGatewayConfigValue(ctx, gatewayId, "autonomy.dispatch_cooldown_minutes"),
      getGatewayConfigValue(ctx, gatewayId, "autonomy.require_clean_approval_queue"),
      getGatewayConfigValue(ctx, gatewayId, "autonomy.channel_platform"),
      getGatewayConfigValue(ctx, gatewayId, "autonomy.external_user_id"),
      getGatewayConfigValue(ctx, gatewayId, "autonomy.agent_id"),
      getGatewayConfigValue(ctx, gatewayId, "autonomy.last_dispatch_at"),
      getGatewayConfigValue(ctx, gatewayId, "autonomy.last_tick_at"),
      ctx.db
        .query("tasks")
        .withIndex("by_gatewayId_status", (q: any) => q.eq("gatewayId", gatewayId))
        .collect(),
      ctx.db
        .query("workerAgents")
        .withIndex("by_gateway_status", (q: any) => q.eq("gatewayId", args.gatewayId).eq("status", "running"))
        .collect(),
      ctx.db.query("approvals").collect(),
      ctx.db
        .query("sessions")
        .withIndex("by_gatewayId", (q: any) => q.eq("gatewayId", args.gatewayId))
        .collect(),
    ]);

    const settings = {
      enabled: parseBool(enabledRaw, DEFAULTS.enabled),
      maxDispatchPerTick: parseNumber(maxDispatchRaw, DEFAULTS.maxDispatchPerTick, 1, 20),
      maxActiveWorkers: parseNumber(maxWorkersRaw, DEFAULTS.maxActiveWorkers, 1, 50),
      taskDueWindowHours: parseNumber(dueWindowRaw, DEFAULTS.taskDueWindowHours, 1, 24 * 30),
      dispatchCooldownMinutes: parseNumber(cooldownRaw, DEFAULTS.dispatchCooldownMinutes, 1, 24 * 60),
      requireCleanApprovalQueue: parseBool(requireCleanRaw, DEFAULTS.requireCleanApprovalQueue),
      channelPlatform: (platformRaw || DEFAULTS.channelPlatform).toLowerCase(),
      externalUserId: externalUserRaw || DEFAULTS.externalUserId,
      agentId: agentIdRaw || DEFAULTS.agentId,
    };

    const now = Date.now();
    const lastDispatchAt = Number.parseInt(lastDispatchRaw || "", 10) || null;
    const lastTickAt = Number.parseInt(lastTickRaw || "", 10) || null;
    const cooldownUntil = lastDispatchAt
      ? lastDispatchAt + settings.dispatchCooldownMinutes * 60 * 1000
      : null;

    const counts = {
      todo: tasks.filter((t: any) => t.status === "todo").length,
      inProgress: tasks.filter((t: any) => t.status === "in_progress").length,
      blocked: tasks.filter((t: any) => t.status === "blocked").length,
      done: tasks.filter((t: any) => t.status === "done").length,
      total: tasks.length,
    };

    const pendingApprovals = approvals.filter(
      (a: any) => String(a.gatewayId) === gatewayId && a.status === "pending",
    ).length;

    const autonomySessions = sessions.filter(
      (s: any) => s.externalUserId === settings.externalUserId,
    ).length;

    return {
      settings,
      metrics: {
        ...counts,
        activeWorkers: activeWorkers.length,
        pendingApprovals,
        autonomySessions,
      },
      runtime: {
        lastDispatchAt,
        lastTickAt,
        cooldownActive: cooldownUntil != null && cooldownUntil > now,
        cooldownUntil,
      },
    };
  },
});

export const setSettings = mutation({
  args: {
    gatewayId: v.id("gateways"),
    enabled: v.optional(v.boolean()),
    maxDispatchPerTick: v.optional(v.number()),
    maxActiveWorkers: v.optional(v.number()),
    taskDueWindowHours: v.optional(v.number()),
    dispatchCooldownMinutes: v.optional(v.number()),
    requireCleanApprovalQueue: v.optional(v.boolean()),
    channelPlatform: v.optional(v.string()),
    externalUserId: v.optional(v.string()),
    agentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const gatewayId = String(args.gatewayId);
    const updates: Array<[string, string]> = [];

    if (args.enabled !== undefined) updates.push(["autonomy.enabled", args.enabled ? "true" : "false"]);
    if (args.maxDispatchPerTick !== undefined) {
      const value = Math.max(1, Math.min(20, Math.floor(args.maxDispatchPerTick)));
      updates.push(["autonomy.max_dispatch_per_tick", String(value)]);
    }
    if (args.maxActiveWorkers !== undefined) {
      const value = Math.max(1, Math.min(50, Math.floor(args.maxActiveWorkers)));
      updates.push(["autonomy.max_active_workers", String(value)]);
    }
    if (args.taskDueWindowHours !== undefined) {
      const value = Math.max(1, Math.min(24 * 30, Math.floor(args.taskDueWindowHours)));
      updates.push(["autonomy.task_due_window_hours", String(value)]);
    }
    if (args.dispatchCooldownMinutes !== undefined) {
      const value = Math.max(1, Math.min(24 * 60, Math.floor(args.dispatchCooldownMinutes)));
      updates.push(["autonomy.dispatch_cooldown_minutes", String(value)]);
    }
    if (args.requireCleanApprovalQueue !== undefined) {
      updates.push([
        "autonomy.require_clean_approval_queue",
        args.requireCleanApprovalQueue ? "true" : "false",
      ]);
    }
    if (args.channelPlatform !== undefined) {
      updates.push(["autonomy.channel_platform", args.channelPlatform.trim().toLowerCase() || "hub"]);
    }
    if (args.externalUserId !== undefined) {
      updates.push(["autonomy.external_user_id", args.externalUserId.trim() || DEFAULTS.externalUserId]);
    }
    if (args.agentId !== undefined) {
      updates.push(["autonomy.agent_id", args.agentId.trim()]);
    }

    for (const [key, value] of updates) {
      await setGatewayConfigValue(ctx, gatewayId, key, value);
    }

    return { ok: true, updated: updates.length };
  },
});

export const triggerNow = mutation({
  args: {
    gatewayId: v.id("gateways"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, (internal as any).actions.autonomy.tickGateway, {
      gatewayId: args.gatewayId,
      reason: args.reason || "manual",
    } as any);
    return { queued: true };
  },
});
