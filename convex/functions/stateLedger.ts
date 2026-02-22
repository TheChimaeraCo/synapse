import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

const RESOURCE_ID_PATTERN = /^[^:]+:[^:]+:[^:]+$/;

const triggerTypeValidator = v.union(
  v.literal("human"),
  v.literal("scheduled"),
  v.literal("chain"),
  v.literal("agent")
);

const chainStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("rolled_back"),
  v.literal("rollback_failed"),
  v.literal("aborted")
);

const stepStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("skipped"),
  v.literal("rolled_back"),
  v.literal("rollback_failed")
);

const errorStrategyValidator = v.union(
  v.literal("stop"),
  v.literal("continue"),
  v.literal("retry"),
  v.literal("rollback")
);

const rollbackStatusValidator = v.union(
  v.literal("not_needed"),
  v.literal("pending"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("skipped")
);

const lockStateValidator = v.union(
  v.literal("active"),
  v.literal("released"),
  v.literal("blocked")
);

const secretActionValidator = v.union(
  v.literal("read"),
  v.literal("write"),
  v.literal("list"),
  v.literal("delete")
);

function clampLimit(limit: number | undefined, fallback = 50, max = 200): number {
  const value = limit ?? fallback;
  if (value < 1) return 1;
  return Math.min(value, max);
}

function assertResourceId(resourceId: string): void {
  if (!RESOURCE_ID_PATTERN.test(resourceId)) {
    throw new Error("resourceId must match namespace:type:name");
  }
}

async function requireExecutionOwnedByAgent(
  ctx: MutationCtx,
  executionId: Id<"chain_executions">,
  agentNamespace: string
) {
  const execution = await ctx.db.get(executionId);
  if (!execution) throw new Error("Execution not found");
  if (execution.agentNamespace !== agentNamespace) {
    throw new Error("Agent-scoped write denied for this execution");
  }
  return execution;
}

export const startExecution = mutation({
  args: {
    gatewayId: v.optional(v.id("gateways")),
    chainName: v.string(),
    chainVersion: v.optional(v.string()),
    agentNamespace: v.string(),
    agentName: v.optional(v.string()),
    agentVersion: v.optional(v.string()),
    triggerType: triggerTypeValidator,
    triggerRef: v.optional(v.string()),
    humanTouchpoint: v.boolean(),
    resourceId: v.string(),
    status: v.optional(v.union(v.literal("pending"), v.literal("running"))),
    preState: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    assertResourceId(args.resourceId);
    const now = Date.now();
    return await ctx.db.insert("chain_executions", {
      gatewayId: args.gatewayId,
      chainName: args.chainName,
      chainVersion: args.chainVersion,
      agentNamespace: args.agentNamespace,
      agentName: args.agentName,
      agentVersion: args.agentVersion,
      triggerType: args.triggerType,
      triggerRef: args.triggerRef,
      humanTouchpoint: args.humanTouchpoint,
      status: args.status ?? "running",
      resourceId: args.resourceId,
      preState: args.preState,
      metadata: args.metadata,
      startedAt: now,
      updatedAt: now,
    });
  },
});

export const setExecutionStatus = mutation({
  args: {
    executionId: v.id("chain_executions"),
    agentNamespace: v.string(),
    status: chainStatusValidator,
    postState: v.optional(v.any()),
    error: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireExecutionOwnedByAgent(ctx, args.executionId, args.agentNamespace);
    const now = Date.now();
    const terminal = args.status !== "pending" && args.status !== "running";

    await ctx.db.patch(args.executionId, {
      status: args.status,
      postState: args.postState,
      error: args.error,
      metadata: args.metadata,
      updatedAt: now,
      ...(terminal ? { completedAt: now } : {}),
    });

    return await ctx.db.get(args.executionId);
  },
});

export const recordStep = mutation({
  args: {
    executionId: v.id("chain_executions"),
    agentNamespace: v.string(),
    order: v.number(),
    stepKey: v.string(),
    stepName: v.optional(v.string()),
    status: stepStatusValidator,
    command: v.optional(v.string()),
    stdout: v.optional(v.string()),
    stderr: v.optional(v.string()),
    exitCode: v.optional(v.number()),
    errorStrategy: v.optional(errorStrategyValidator),
    retryCount: v.optional(v.number()),
    rollbackCommand: v.optional(v.string()),
    rollbackStatus: v.optional(rollbackStatusValidator),
    metadata: v.optional(v.any()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireExecutionOwnedByAgent(ctx, args.executionId, args.agentNamespace);
    const existing = await ctx.db
      .query("step_executions")
      .withIndex("by_chain_order", (q) =>
        q.eq("chainExecutionId", args.executionId).eq("order", args.order)
      )
      .first();

    const now = Date.now();
    const payload = {
      stepKey: args.stepKey,
      stepName: args.stepName,
      status: args.status,
      command: args.command,
      stdout: args.stdout,
      stderr: args.stderr,
      exitCode: args.exitCode,
      errorStrategy: args.errorStrategy,
      retryCount: args.retryCount ?? 0,
      rollbackCommand: args.rollbackCommand,
      rollbackStatus: args.rollbackStatus,
      metadata: args.metadata,
      startedAt: args.startedAt ?? now,
      completedAt: args.completedAt,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("step_executions", {
      chainExecutionId: args.executionId,
      order: args.order,
      ...payload,
    });
  },
});

export const acquireLock = mutation({
  args: {
    executionId: v.id("chain_executions"),
    agentNamespace: v.string(),
    resourceId: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    assertResourceId(args.resourceId);
    await requireExecutionOwnedByAgent(ctx, args.executionId, args.agentNamespace);

    const blocked = await ctx.db
      .query("resource_locks")
      .withIndex("by_resource_state", (q) =>
        q.eq("resourceId", args.resourceId).eq("lockState", "blocked")
      )
      .first();
    if (blocked) {
      throw new Error("Resource is locked by circuit breaker and requires human clear");
    }

    const active = await ctx.db
      .query("resource_locks")
      .withIndex("by_resource_state", (q) =>
        q.eq("resourceId", args.resourceId).eq("lockState", "active")
      )
      .first();
    if (active && active.executionId !== args.executionId) {
      throw new Error("Resource is already locked by another chain execution");
    }
    if (active) return active._id;

    const now = Date.now();
    const lockId = await ctx.db.insert("resource_locks", {
      resourceId: args.resourceId,
      executionId: args.executionId,
      agentNamespace: args.agentNamespace,
      lockState: "active",
      acquiredAt: now,
      metadata: args.metadata,
    });
    await ctx.db.patch(args.executionId, { lockId, updatedAt: now });
    return lockId;
  },
});

export const releaseLock = mutation({
  args: {
    lockId: v.id("resource_locks"),
    agentNamespace: v.string(),
    releaseReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const lock = await ctx.db.get(args.lockId);
    if (!lock) throw new Error("Lock not found");
    if (lock.agentNamespace !== args.agentNamespace) {
      throw new Error("Agent-scoped write denied for this lock");
    }
    if (lock.lockState !== "active") return { released: false, state: lock.lockState };

    await ctx.db.patch(args.lockId, {
      lockState: "released",
      releasedAt: Date.now(),
      releaseReason: args.releaseReason ?? "released",
    });
    return { released: true };
  },
});

export const markResourceBlocked = mutation({
  args: {
    executionId: v.id("chain_executions"),
    agentNamespace: v.string(),
    resourceId: v.string(),
    reason: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    assertResourceId(args.resourceId);
    await requireExecutionOwnedByAgent(ctx, args.executionId, args.agentNamespace);

    const existingBlocked = await ctx.db
      .query("resource_locks")
      .withIndex("by_resource_state", (q) =>
        q.eq("resourceId", args.resourceId).eq("lockState", "blocked")
      )
      .first();
    if (existingBlocked) return existingBlocked._id;

    const now = Date.now();
    const lockId = await ctx.db.insert("resource_locks", {
      resourceId: args.resourceId,
      executionId: args.executionId,
      agentNamespace: args.agentNamespace,
      lockState: "blocked",
      acquiredAt: now,
      releaseReason: args.reason,
      metadata: args.metadata,
    });
    await ctx.db.patch(args.executionId, {
      lockId,
      status: "rollback_failed",
      error: args.reason ?? "Resource blocked after rollback failure",
      completedAt: now,
      updatedAt: now,
    });
    return lockId;
  },
});

export const recordResourceHealth = mutation({
  args: {
    resourceId: v.string(),
    agentNamespace: v.string(),
    success: v.boolean(),
    executionId: v.optional(v.id("chain_executions")),
    lockOnFailure: v.optional(v.boolean()),
    reason: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    assertResourceId(args.resourceId);
    if (args.executionId) {
      await requireExecutionOwnedByAgent(ctx, args.executionId, args.agentNamespace);
    }

    const existing = await ctx.db
      .query("resource_health")
      .withIndex("by_resource_agent", (q) =>
        q.eq("resourceId", args.resourceId).eq("agentNamespace", args.agentNamespace)
      )
      .first();

    const now = Date.now();
    const shouldLock = !args.success && ((existing?.locked ?? false) || args.lockOnFailure === true);

    if (existing) {
      await ctx.db.patch(existing._id, {
        consecutiveFailures: args.success ? 0 : existing.consecutiveFailures + 1,
        locked: shouldLock,
        lockReason: shouldLock ? (args.reason ?? existing.lockReason) : existing.lockReason,
        lockedAt: shouldLock && !existing.locked ? now : existing.lockedAt,
        lastFailureAt: args.success ? existing.lastFailureAt : now,
        lastSuccessAt: args.success ? now : existing.lastSuccessAt,
        lastExecutionId: args.executionId ?? existing.lastExecutionId,
        updatedAt: now,
        metadata: args.metadata ?? existing.metadata,
      });
      return existing._id;
    }

    return await ctx.db.insert("resource_health", {
      resourceId: args.resourceId,
      agentNamespace: args.agentNamespace,
      consecutiveFailures: args.success ? 0 : 1,
      locked: shouldLock,
      lockReason: shouldLock ? args.reason : undefined,
      lockedAt: shouldLock ? now : undefined,
      lastFailureAt: args.success ? undefined : now,
      lastSuccessAt: args.success ? now : undefined,
      lastExecutionId: args.executionId,
      updatedAt: now,
      metadata: args.metadata,
    });
  },
});

export const clearResourceLockByHuman = mutation({
  args: {
    resourceId: v.string(),
    humanTouchpoint: v.boolean(),
    clearedBy: v.string(),
    agentNamespace: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.humanTouchpoint) {
      throw new Error("humanTouchpoint must be true to clear blocked resources");
    }
    assertResourceId(args.resourceId);

    const now = Date.now();
    const blockedLocks = await ctx.db
      .query("resource_locks")
      .withIndex("by_resource_state", (q) =>
        q.eq("resourceId", args.resourceId).eq("lockState", "blocked")
      )
      .collect();

    let releasedLocks = 0;
    for (const lock of blockedLocks) {
      if (args.agentNamespace && lock.agentNamespace !== args.agentNamespace) continue;
      await ctx.db.patch(lock._id, {
        lockState: "released",
        releasedAt: now,
        releaseReason: args.note
          ? `human-clear:${args.clearedBy}:${args.note}`
          : `human-clear:${args.clearedBy}`,
      });
      releasedLocks += 1;
    }

    const healthRows = await ctx.db.query("resource_health").collect();
    let updatedHealth = 0;
    for (const row of healthRows) {
      if (row.resourceId !== args.resourceId) continue;
      if (args.agentNamespace && row.agentNamespace !== args.agentNamespace) continue;
      await ctx.db.patch(row._id, {
        locked: false,
        consecutiveFailures: 0,
        updatedAt: now,
        lockReason: args.note
          ? `human-clear:${args.clearedBy}:${args.note}`
          : `human-clear:${args.clearedBy}`,
      });
      updatedHealth += 1;
    }

    return { releasedLocks, updatedHealth };
  },
});

export const logSecretAccess = mutation({
  args: {
    executionId: v.id("chain_executions"),
    stepExecutionId: v.optional(v.id("step_executions")),
    agentNamespace: v.string(),
    resourceId: v.string(),
    secretRef: v.string(),
    action: secretActionValidator,
    allowed: v.boolean(),
    reason: v.optional(v.string()),
    metadata: v.optional(v.any()),
    enforceResourceLock: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertResourceId(args.resourceId);
    await requireExecutionOwnedByAgent(ctx, args.executionId, args.agentNamespace);

    if (args.stepExecutionId) {
      const step = await ctx.db.get(args.stepExecutionId);
      if (!step || step.chainExecutionId !== args.executionId) {
        throw new Error("stepExecutionId does not belong to executionId");
      }
    }

    if (args.allowed && (args.enforceResourceLock ?? true)) {
      const activeLocks = await ctx.db
        .query("resource_locks")
        .withIndex("by_resource_state", (q) =>
          q.eq("resourceId", args.resourceId).eq("lockState", "active")
        )
        .collect();
      const hasExecutionLock = activeLocks.some((lock) => lock.executionId === args.executionId);
      if (!hasExecutionLock) {
        throw new Error("Secret access requires active lock ownership on resource");
      }
    }

    return await ctx.db.insert("secret_access_log", {
      executionId: args.executionId,
      stepExecutionId: args.stepExecutionId,
      resourceId: args.resourceId,
      secretRef: args.secretRef,
      agentNamespace: args.agentNamespace,
      action: args.action,
      allowed: args.allowed,
      reason: args.reason,
      metadata: args.metadata,
      accessedAt: Date.now(),
    });
  },
});

export const listExecutions = query({
  args: {
    limit: v.optional(v.number()),
    agentNamespace: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    status: v.optional(chainStatusValidator),
  },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);
    if (args.resourceId) assertResourceId(args.resourceId);

    let rows;
    if (args.resourceId && args.status) {
      rows = await ctx.db
        .query("chain_executions")
        .withIndex("by_resource_status", (q) =>
          q.eq("resourceId", args.resourceId!).eq("status", args.status!)
        )
        .order("desc")
        .take(limit);
    } else if (args.agentNamespace) {
      rows = await ctx.db
        .query("chain_executions")
        .withIndex("by_agent_started", (q) => q.eq("agentNamespace", args.agentNamespace!))
        .order("desc")
        .take(limit * 2);
    } else if (args.status) {
      rows = await ctx.db
        .query("chain_executions")
        .withIndex("by_status_started", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit * 2);
    } else {
      rows = await ctx.db
        .query("chain_executions")
        .withIndex("by_startedAt")
        .order("desc")
        .take(limit);
    }

    const filtered = rows.filter((row) => {
      if (args.agentNamespace && row.agentNamespace !== args.agentNamespace) return false;
      if (args.resourceId && row.resourceId !== args.resourceId) return false;
      if (args.status && row.status !== args.status) return false;
      return true;
    });
    return filtered.slice(0, limit);
  },
});

export const getExecutionWithSteps = query({
  args: { executionId: v.id("chain_executions") },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) return null;

    const steps = await ctx.db
      .query("step_executions")
      .withIndex("by_chain_order", (q) => q.eq("chainExecutionId", args.executionId))
      .order("asc")
      .collect();

    const lock = execution.lockId ? await ctx.db.get(execution.lockId) : null;
    const secretAccess = await ctx.db
      .query("secret_access_log")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
      .order("desc")
      .take(50);

    return { execution, steps, lock, secretAccess };
  },
});

export const listLocks = query({
  args: {
    limit: v.optional(v.number()),
    resourceId: v.optional(v.string()),
    lockState: v.optional(lockStateValidator),
    agentNamespace: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);
    if (args.resourceId) assertResourceId(args.resourceId);

    let rows;
    if (args.resourceId && args.lockState) {
      rows = await ctx.db
        .query("resource_locks")
        .withIndex("by_resource_state", (q) =>
          q.eq("resourceId", args.resourceId!).eq("lockState", args.lockState!)
        )
        .take(limit * 2);
    } else if (args.resourceId) {
      rows = await ctx.db
        .query("resource_locks")
        .withIndex("by_resource", (q) => q.eq("resourceId", args.resourceId!))
        .take(limit * 2);
    } else if (args.agentNamespace && args.lockState) {
      rows = await ctx.db
        .query("resource_locks")
        .withIndex("by_agent_state", (q) =>
          q.eq("agentNamespace", args.agentNamespace!).eq("lockState", args.lockState!)
        )
        .take(limit * 2);
    } else {
      rows = await ctx.db.query("resource_locks").collect();
    }

    const filtered = rows.filter((row) => {
      if (args.agentNamespace && row.agentNamespace !== args.agentNamespace) return false;
      if (args.lockState && row.lockState !== args.lockState) return false;
      return true;
    });

    filtered.sort((a, b) => b.acquiredAt - a.acquiredAt);
    return filtered.slice(0, limit);
  },
});

export const listResourceHealth = query({
  args: {
    limit: v.optional(v.number()),
    resourceId: v.optional(v.string()),
    agentNamespace: v.optional(v.string()),
    lockedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);
    if (args.resourceId) assertResourceId(args.resourceId);

    let rows;
    if (args.lockedOnly) {
      rows = await ctx.db
        .query("resource_health")
        .withIndex("by_locked", (q) => q.eq("locked", true))
        .take(limit * 4);
    } else {
      rows = await ctx.db
        .query("resource_health")
        .withIndex("by_updatedAt")
        .order("desc")
        .take(limit * 4);
    }

    const filtered = rows.filter((row) => {
      if (args.resourceId && row.resourceId !== args.resourceId) return false;
      if (args.agentNamespace && row.agentNamespace !== args.agentNamespace) return false;
      if (args.lockedOnly && !row.locked) return false;
      return true;
    });

    filtered.sort((a, b) => b.updatedAt - a.updatedAt);
    return filtered.slice(0, limit);
  },
});

export const listSecretAccess = query({
  args: {
    limit: v.optional(v.number()),
    resourceId: v.optional(v.string()),
    secretRef: v.optional(v.string()),
    executionId: v.optional(v.id("chain_executions")),
    agentNamespace: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);
    if (args.resourceId) assertResourceId(args.resourceId);

    let rows;
    if (args.resourceId) {
      rows = await ctx.db
        .query("secret_access_log")
        .withIndex("by_resource_time", (q) => q.eq("resourceId", args.resourceId!))
        .order("desc")
        .take(limit * 4);
    } else if (args.secretRef) {
      rows = await ctx.db
        .query("secret_access_log")
        .withIndex("by_secret_time", (q) => q.eq("secretRef", args.secretRef!))
        .order("desc")
        .take(limit * 4);
    } else if (args.executionId) {
      rows = await ctx.db
        .query("secret_access_log")
        .withIndex("by_execution", (q) => q.eq("executionId", args.executionId!))
        .order("desc")
        .take(limit * 4);
    } else if (args.agentNamespace) {
      rows = await ctx.db
        .query("secret_access_log")
        .withIndex("by_agent_time", (q) => q.eq("agentNamespace", args.agentNamespace!))
        .order("desc")
        .take(limit * 4);
    } else {
      rows = await ctx.db.query("secret_access_log").collect();
    }

    const filtered = rows.filter((row) => {
      if (args.secretRef && row.secretRef !== args.secretRef) return false;
      if (args.executionId && row.executionId !== args.executionId) return false;
      if (args.agentNamespace && row.agentNamespace !== args.agentNamespace) return false;
      return true;
    });
    filtered.sort((a, b) => b.accessedAt - a.accessedAt);
    return filtered.slice(0, limit);
  },
});
