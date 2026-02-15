import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

// --- Cron expression parser (minimal) ---
function parseCronField(field: string, min: number, max: number): number[] {
  if (field === "*") return Array.from({ length: max - min + 1 }, (_, i) => i + min);
  const values: number[] = [];
  for (const part of field.split(",")) {
    if (part.includes("-")) {
      const [a, b] = part.split("-").map(Number);
      for (let i = a; i <= b; i++) values.push(i);
    } else if (part.includes("/")) {
      const [base, step] = part.split("/");
      const start = base === "*" ? min : Number(base);
      for (let i = start; i <= max; i += Number(step)) values.push(i);
    } else {
      values.push(Number(part));
    }
  }
  return values;
}

function nextCronRun(cronExpr: string, after: number): number {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return after + 60000; // fallback 1min
  const [minF, hourF, domF, monF, dowF] = parts;
  const minutes = parseCronField(minF, 0, 59);
  const hours = parseCronField(hourF, 0, 23);
  const doms = parseCronField(domF, 1, 31);
  const months = parseCronField(monF, 1, 12);
  const dows = parseCronField(dowF, 0, 6);

  const d = new Date(after + 60000); // start checking from next minute
  d.setSeconds(0, 0);

  for (let i = 0; i < 525960; i++) { // max ~1 year of minutes
    if (
      minutes.includes(d.getUTCMinutes()) &&
      hours.includes(d.getUTCHours()) &&
      doms.includes(d.getUTCDate()) &&
      months.includes(d.getUTCMonth() + 1) &&
      dows.includes(d.getUTCDay())
    ) {
      return d.getTime();
    }
    d.setTime(d.getTime() + 60000);
  }
  return after + 86400000; // fallback 1 day
}

// --- CRUD ---

export const create = mutation({
  args: {
    gatewayId: v.id("gateways"),
    userId: v.optional(v.id("authUsers")),
    sessionId: v.optional(v.id("sessions")),
    label: v.string(),
    type: v.union(v.literal("once"), v.literal("recurring")),
    cronExpr: v.optional(v.string()),
    scheduledAt: v.optional(v.number()),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let nextRunAt: number | undefined;
    if (args.type === "once") {
      nextRunAt = args.scheduledAt;
    } else if (args.cronExpr) {
      nextRunAt = nextCronRun(args.cronExpr, now);
    }
    return await ctx.db.insert("scheduledTasks", {
      ...args,
      status: "active",
      nextRunAt,
      createdAt: now,
    });
  },
});

export const list = query({
  args: {
    gatewayId: v.id("gateways"),
    userId: v.optional(v.id("authUsers")),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.userId) {
      const status = (args.status || "active") as "active" | "paused" | "completed" | "cancelled";
      return await ctx.db
        .query("scheduledTasks")
        .withIndex("by_user", (q) => q.eq("userId", args.userId!).eq("status", status))
        .collect();
    }
    return await ctx.db
      .query("scheduledTasks")
      .withIndex("by_gateway", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
  },
});

export const update = mutation({
  args: {
    id: v.id("scheduledTasks"),
    label: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("paused"), v.literal("completed"), v.literal("cancelled"))),
    cronExpr: v.optional(v.string()),
    scheduledAt: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    await ctx.db.patch(id, clean);
  },
});

export const cancel = mutation({
  args: { id: v.id("scheduledTasks") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "cancelled" });
  },
});

export const complete = mutation({
  args: { id: v.id("scheduledTasks") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "completed" });
  },
});

export const getDue = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const tasks = await ctx.db
      .query("scheduledTasks")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return tasks.filter((t) => t.nextRunAt != null && t.nextRunAt <= now);
  },
});

export const markRun = mutation({
  args: { id: v.id("scheduledTasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) return;
    const now = Date.now();
    if (task.type === "once") {
      await ctx.db.patch(args.id, { lastRunAt: now, status: "completed" });
    } else if (task.cronExpr) {
      const next = nextCronRun(task.cronExpr, now);
      await ctx.db.patch(args.id, { lastRunAt: now, nextRunAt: next });
    }
  },
});

// --- Cron handler ---

export const checkDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const tasks = await ctx.db
      .query("scheduledTasks")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const due = tasks.filter((t) => t.nextRunAt != null && t.nextRunAt <= now);

    for (const task of due) {
      // Try to insert a reminder message into the user's session
      if (task.sessionId) {
        const session = await ctx.db.get(task.sessionId);
        if (session) {
          await ctx.db.insert("messages", {
            gatewayId: task.gatewayId,
            sessionId: task.sessionId,
            agentId: session.agentId,
            role: "assistant",
            content: `⏰ Reminder: ${task.label}`,
          });
          // Update session lastMessageAt
          await ctx.db.patch(task.sessionId, {
            lastMessageAt: now,
            messageCount: session.messageCount + 1,
          });
        }
      }

      // Mark run (complete one-time, advance recurring)
      if (task.type === "once") {
        await ctx.db.patch(task._id, { lastRunAt: now, status: "completed" });
      } else if (task.cronExpr) {
        const next = nextCronRun(task.cronExpr, now);
        await ctx.db.patch(task._id, { lastRunAt: now, nextRunAt: next });
      }
    }

    return due.length;
  },
});
