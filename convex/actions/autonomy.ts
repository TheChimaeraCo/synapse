"use node";

import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";

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

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseBool(value: unknown, fallback: boolean): boolean {
  const v = clean(value).toLowerCase();
  if (!v) return fallback;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

function parseIntBound(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(clean(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function getGatewayValue(ctx: any, gatewayId: string, key: string): Promise<string> {
  try {
    const res = await ctx.runQuery(api.functions.gatewayConfig.getWithInheritance as any, {
      gatewayId,
      key,
    });
    return clean(res?.value);
  } catch {
    return "";
  }
}

function sortCandidateTasks(tasks: any[]): any[] {
  return [...tasks].sort((a, b) => {
    const pa = Number(a.priority || 0);
    const pb = Number(b.priority || 0);
    if (pa !== pb) return pb - pa;

    const da = typeof a.dueDate === "number" ? a.dueDate : Number.POSITIVE_INFINITY;
    const db = typeof b.dueDate === "number" ? b.dueDate : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;

    return Number(a.createdAt || 0) - Number(b.createdAt || 0);
  });
}

function buildDispatchPrompt(task: any, opts: {
  projectName?: string;
  dueDateText?: string;
  reason: string;
}): string {
  const title = clean(task.title) || "Untitled task";
  const description = clean(task.description) || "No extra description provided.";
  const projectLine = opts.projectName ? `Project: ${opts.projectName}` : "Project: (unassigned)";
  const dueLine = opts.dueDateText ? `Due: ${opts.dueDateText}` : "Due: none set";

  return [
    "[AUTONOMY DISPATCH]",
    `Reason: ${opts.reason}`,
    `Task: ${title}`,
    projectLine,
    `Priority: ${task.priority ?? 0}/5`,
    dueLine,
    "",
    "Task Details:",
    description,
    "",
    "Execution Requirements:",
    "1. Execute this task end-to-end using available tools.",
    "2. Use sub-agents if parallel work improves speed or quality.",
    "3. If an operation is risky/destructive, route through approval flow.",
    "4. Keep a concise progress trail and produce a completion summary.",
    "5. When complete, update the task status in the project/task tools.",
  ].join("\n");
}

async function resolveDispatchChannel(ctx: any, gatewayId: string, preferredPlatform: string) {
  const channels: any[] = await ctx.runQuery(api.functions.channels.listForGateway as any, {
    gatewayId,
  });
  const enabled = channels.filter((c) => c.isActive !== false && c.enabled !== false);
  if (enabled.length === 0) return null;

  const preferred = enabled.find((c) => clean(c.platform).toLowerCase() === preferredPlatform);
  if (preferred) return preferred;

  const hub = enabled.find((c) => clean(c.platform).toLowerCase() === "hub");
  if (hub) return hub;

  return enabled[0];
}

async function runGatewayTick(ctx: any, gatewayId: string, reason: string) {
  const now = Date.now();
  const [
    enabledRaw,
    maxDispatchRaw,
    maxWorkersRaw,
    dueWindowRaw,
    cooldownRaw,
    requireCleanRaw,
    platformRaw,
    externalUserIdRaw,
    agentIdRaw,
    lastDispatchRaw,
  ] = await Promise.all([
    getGatewayValue(ctx, gatewayId, "autonomy.enabled"),
    getGatewayValue(ctx, gatewayId, "autonomy.max_dispatch_per_tick"),
    getGatewayValue(ctx, gatewayId, "autonomy.max_active_workers"),
    getGatewayValue(ctx, gatewayId, "autonomy.task_due_window_hours"),
    getGatewayValue(ctx, gatewayId, "autonomy.dispatch_cooldown_minutes"),
    getGatewayValue(ctx, gatewayId, "autonomy.require_clean_approval_queue"),
    getGatewayValue(ctx, gatewayId, "autonomy.channel_platform"),
    getGatewayValue(ctx, gatewayId, "autonomy.external_user_id"),
    getGatewayValue(ctx, gatewayId, "autonomy.agent_id"),
    getGatewayValue(ctx, gatewayId, "autonomy.last_dispatch_at"),
  ]);

  const settings = {
    enabled: parseBool(enabledRaw, DEFAULTS.enabled),
    maxDispatchPerTick: parseIntBound(maxDispatchRaw, DEFAULTS.maxDispatchPerTick, 1, 20),
    maxActiveWorkers: parseIntBound(maxWorkersRaw, DEFAULTS.maxActiveWorkers, 1, 50),
    taskDueWindowHours: parseIntBound(dueWindowRaw, DEFAULTS.taskDueWindowHours, 1, 24 * 30),
    dispatchCooldownMinutes: parseIntBound(cooldownRaw, DEFAULTS.dispatchCooldownMinutes, 1, 24 * 60),
    requireCleanApprovalQueue: parseBool(requireCleanRaw, DEFAULTS.requireCleanApprovalQueue),
    channelPlatform: clean(platformRaw).toLowerCase() || DEFAULTS.channelPlatform,
    externalUserId: clean(externalUserIdRaw) || DEFAULTS.externalUserId,
    agentId: clean(agentIdRaw),
  };

  await ctx.runMutation(api.functions.gatewayConfig.set as any, {
    gatewayId,
    key: "autonomy.last_tick_at",
    value: String(now),
  });

  if (!settings.enabled) {
    return {
      gatewayId,
      dispatched: 0,
      skipped: "disabled",
      details: "autonomy.enabled is false",
    };
  }

  const activeWorkers: any[] = await ctx.runQuery(api.functions.workerAgents.getActive as any, {
    gatewayId,
  });
  const availableWorkerSlots = Math.max(0, settings.maxActiveWorkers - activeWorkers.length);
  if (availableWorkerSlots <= 0) {
    return {
      gatewayId,
      dispatched: 0,
      skipped: "worker_limit",
      details: "max active workers reached",
    };
  }

  if (settings.requireCleanApprovalQueue) {
    const pending: any[] = await ctx.runQuery(api.functions.approvals.getPendingForGateway as any, {
      gatewayId,
    });
    if (pending.length > 0) {
      return {
        gatewayId,
        dispatched: 0,
        skipped: "pending_approvals",
        details: "approval queue not empty",
      };
    }
  }

  const lastDispatchAt = Number.parseInt(lastDispatchRaw || "", 10);
  if (Number.isFinite(lastDispatchAt) && lastDispatchAt > 0) {
    const cooldownUntil = lastDispatchAt + settings.dispatchCooldownMinutes * 60 * 1000;
    if (cooldownUntil > now) {
      return {
        gatewayId,
        dispatched: 0,
        skipped: "cooldown",
        details: `next dispatch after ${new Date(cooldownUntil).toISOString()}`,
      };
    }
  }

  const channel = await resolveDispatchChannel(ctx, gatewayId, settings.channelPlatform);
  if (!channel) {
    return {
      gatewayId,
      dispatched: 0,
      skipped: "no_channel",
      details: "no active channel available for autonomy dispatch",
    };
  }

  let agentId = channel.agentId;
  if (settings.agentId) {
    try {
      const configuredAgent = await ctx.runQuery(api.functions.agents.get as any, {
        id: settings.agentId,
      });
      if (
        configuredAgent &&
        configuredAgent.isActive !== false &&
        String(configuredAgent.gatewayId) === String(gatewayId)
      ) {
        agentId = configuredAgent._id;
      }
    } catch {
      // If invalid, fallback to channel agent.
    }
  }

  const todoTasks: any[] = await ctx.runQuery(api.functions.tasks.list as any, {
    gatewayId: String(gatewayId),
    status: "todo",
  });
  const dueCutoff = now + settings.taskDueWindowHours * 60 * 60 * 1000;
  const candidates = sortCandidateTasks(
    todoTasks.filter((task) => {
      if (typeof task.dueDate === "number" && task.dueDate > dueCutoff && Number(task.priority || 0) <= 3) {
        return false;
      }
      return true;
    }),
  );

  const dispatchLimit = Math.min(
    settings.maxDispatchPerTick,
    availableWorkerSlots,
    candidates.length,
  );
  if (dispatchLimit <= 0) {
    return {
      gatewayId,
      dispatched: 0,
      skipped: "no_tasks",
      details: "no eligible TODO tasks",
    };
  }

  const dispatchedTaskIds: string[] = [];

  for (const task of candidates.slice(0, dispatchLimit)) {
    let projectName = "";
    if (task.projectId) {
      try {
        const project = await ctx.runQuery(api.functions.projects.get as any, { id: task.projectId });
        projectName = clean(project?.name);
      } catch {
        // Ignore missing project metadata.
      }
    }

    const dueDateText =
      typeof task.dueDate === "number"
        ? new Date(task.dueDate).toISOString()
        : "";

    const sessionId = await ctx.runMutation(api.functions.sessions.findOrCreate as any, {
      gatewayId,
      agentId,
      channelId: channel._id,
      externalUserId: settings.externalUserId,
    });

    const prompt = buildDispatchPrompt(task, {
      projectName,
      dueDateText,
      reason,
    });

    await ctx.runMutation(api.functions.messages.create as any, {
      gatewayId,
      sessionId,
      agentId,
      role: "user",
      content: prompt,
      metadata: {
        source: "autonomy_dispatch",
        taskId: String(task._id),
        projectId: task.projectId ? String(task.projectId) : null,
      },
    });

    await ctx.runMutation(api.functions.tasks.update as any, {
      id: task._id,
      status: "in_progress",
      assignee: "autonomy",
    });

    if (task.projectId) {
      await ctx.runMutation(api.functions.projects.updateActivity as any, {
        id: task.projectId,
      });
    }

    await ctx.scheduler.runAfter(0, internal.actions.router.processSession as any, {
      sessionId,
      gatewayId,
    });

    dispatchedTaskIds.push(String(task._id));
  }

  if (dispatchedTaskIds.length > 0) {
    await ctx.runMutation(api.functions.gatewayConfig.set as any, {
      gatewayId,
      key: "autonomy.last_dispatch_at",
      value: String(now),
    });
  }

  return {
    gatewayId,
    dispatched: dispatchedTaskIds.length,
    skipped: null,
    details: dispatchedTaskIds.length > 0 ? "tasks dispatched" : "nothing dispatched",
    taskIds: dispatchedTaskIds,
  };
}

export const tick = internalAction({
  args: {},
  handler: async (ctx) => {
    const gateways: any[] = await ctx.runQuery(api.functions.gateways.list as any, {});
    const results: any[] = [];

    for (const gateway of gateways) {
      try {
        const result = await runGatewayTick(ctx, String(gateway._id), "scheduled_tick");
        results.push(result);
      } catch (err: any) {
        results.push({
          gatewayId: String(gateway._id),
          dispatched: 0,
          skipped: "error",
          details: clean(err?.message || String(err)),
        });
      }
    }

    return {
      gateways: gateways.length,
      dispatched: results.reduce((sum, r) => sum + Number(r.dispatched || 0), 0),
      results,
    };
  },
});

export const tickGateway = internalAction({
  args: {
    gatewayId: v.id("gateways"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await runGatewayTick(ctx, String(args.gatewayId), clean(args.reason) || "manual");
  },
});
