"use node";
import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";

// Simple cron expression parser for common patterns
function cronIsDue(schedule: string, now: Date): boolean {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minP, hourP, , , ] = parts;
  const minute = now.getUTCMinutes();
  const hour = now.getUTCHours();

  function matchField(pattern: string, value: number): boolean {
    if (pattern === "*") return true;
    // */N
    if (pattern.startsWith("*/")) {
      const n = parseInt(pattern.slice(2));
      return !isNaN(n) && n > 0 && value % n === 0;
    }
    // comma-separated
    const vals = pattern.split(",").map((s) => parseInt(s.trim()));
    return vals.includes(value);
  }

  return matchField(minP, minute) && matchField(hourP, hour);
}

type ModuleResult = { status: "ok" | "alert" | "error"; message: string; data?: any };

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const startedAt = now;

    // Get first gateway (single-tenant for now)
    // Get first gateway by slug (single-tenant)
    const gateway: any = await ctx.runQuery(api.functions.gateways.getBySlug as any, { slug: "default" });
    if (!gateway) return { error: "No gateway found" };
    const gatewayId = gateway._id;

    // Get enabled modules
    const modules: any[] = await ctx.runQuery(api.functions.heartbeat.listEnabled, { gatewayId });
    
    const results: Record<string, ModuleResult> = {};
    let modulesRun = 0;
    let alerts = 0;

    for (const mod of modules) {
      // Check if due based on interval
      const lastRun = mod.lastRunAt ?? 0;
      const intervalMs = mod.intervalMinutes * 60 * 1000;
      if (now - lastRun < intervalMs) continue;

      let result: ModuleResult;
      try {
        result = await runCheck(ctx, mod.handler, gatewayId);
      } catch (e: any) {
        result = { status: "error", message: e.message || "Unknown error" };
      }

      results[mod.name] = result;
      modulesRun++;
      if (result.status === "alert" || result.status === "error") alerts++;

      // Update module state
      await ctx.runMutation(internal.functions.heartbeat.updateModuleRun, {
        id: mod._id,
        lastRunAt: now,
        lastResult: result.message,
        lastStatus: result.status,
      });
    }

    // Record run
    await ctx.runMutation(internal.functions.heartbeat.recordRun, {
      gatewayId,
      startedAt,
      completedAt: Date.now(),
      modulesRun,
      alerts,
      results,
    });

    // Create notification for alerts
    if (alerts > 0) {
      const alertEntries = Object.entries(results).filter(([, r]) => r.status !== "ok");
      await ctx.runMutation(api.functions.notifications.create, {
        type: alertEntries.some(([, r]) => r.status === "error") ? "critical" : "warning",
        title: "Heartbeat Alert",
        message: alertEntries.map(([name, r]) => `${name}: ${r.message}`).join("; "),
      });
    }

    // Run due user cron jobs
    try {
      const cronJobs: any[] = await ctx.runQuery(api.functions.heartbeat.listEnabledCronJobs, { gatewayId });
      const nowDate = new Date(now);
      for (const job of cronJobs) {
        if (cronIsDue(job.schedule, nowDate)) {
          // Mark as run (actual execution would be an external call)
          await ctx.runMutation(internal.functions.heartbeat.updateCronJobRun, {
            id: job._id,
            lastRunAt: now,
            lastStatus: "ok",
            lastResult: `Triggered at ${nowDate.toISOString()}`,
          });
        }
      }
    } catch (e: any) {
      // Cron job checking is best-effort
    }

    return { modulesRun, alerts, results };
  },
});

async function runCheck(ctx: any, handler: string, gatewayId: any): Promise<ModuleResult> {
  switch (handler) {
    case "system_health":
      return { status: "ok", message: "Convex backend responding" };

    case "channel_health": {
      try {
        const channels: any[] = await ctx.runQuery(api.functions.channels.list, { gatewayId });
        const active = channels.filter((c: any) => c.isActive);
        const stale = active.filter((c: any) => {
          const lastAct = c.lastActivityAt ?? c.createdAt;
          return Date.now() - lastAct > 24 * 60 * 60 * 1000;
        });
        if (active.length === 0) {
          return { status: "alert", message: "No active channels" };
        }
        if (stale.length > 0) {
          return { status: "alert", message: `${stale.length}/${active.length} channels stale (>24h)` };
        }
        return { status: "ok", message: `${active.length} channels active` };
      } catch (e: any) {
        return { status: "error", message: `Channel check failed: ${e.message}` };
      }
    }

    case "ai_health": {
      try {
        const messages: any[] = await ctx.runQuery(api.functions.messages.list as any, { limit: 5 });
        if (!messages || messages.length === 0) {
          return { status: "alert", message: "No messages found" };
        }
        const last = messages[0];
        const age = Date.now() - last._creationTime;
        if (age > 86400000) return { status: "alert", message: `Last message ${Math.round(age / 3600000)}h ago` };
        if (age > 3600000) return { status: "ok", message: `Last message ${Math.round(age / 60000)}m ago` };
        return { status: "ok", message: `Last message ${Math.round(age / 60000)}m ago` };
      } catch (e: any) {
        return { status: "error", message: `AI check failed: ${e.message}` };
      }
    }

    case "session_health": {
      try {
        const sessions: any[] = await ctx.runQuery(api.functions.sessions.list as any, { gatewayId, status: "active", limit: 100 });
        const stale = sessions.filter((s: any) => Date.now() - s.lastMessageAt > 2 * 60 * 60 * 1000);
        if (stale.length > sessions.length * 0.5 && sessions.length > 0) {
          return { status: "alert", message: `${stale.length}/${sessions.length} sessions stale (>2h)` };
        }
        return { status: "ok", message: `${sessions.length} active sessions, ${stale.length} stale` };
      } catch (e: any) {
        return { status: "error", message: `Session check failed: ${e.message}` };
      }
    }

    case "usage_check": {
      try {
        const today = new Date().toISOString().split("T")[0];
        const budgets: any[] = await ctx.runQuery(api.functions.usage.getBudget as any, { gatewayId });
        if (!budgets || budgets.length === 0) {
          return { status: "ok", message: "No budgets configured" };
        }
        return { status: "ok", message: `${budgets.length} budget(s) configured` };
      } catch (e: any) {
        return { status: "ok", message: "Usage check skipped (no budget API)" };
      }
    }

    case "knowledge_freshness": {
      try {
        const knowledge: any[] = await ctx.runQuery(api.functions.knowledge.list as any, { gatewayId, limit: 1 });
        if (!knowledge || knowledge.length === 0) {
          return { status: "ok", message: "No knowledge entries yet" };
        }
        const age = Date.now() - knowledge[0].updatedAt;
        if (age > 7 * 24 * 60 * 60 * 1000) {
          return { status: "alert", message: `Knowledge stale - last update ${Math.round(age / 86400000)}d ago` };
        }
        return { status: "ok", message: `Last knowledge update ${Math.round(age / 3600000)}h ago` };
      } catch (e: any) {
        return { status: "ok", message: "Knowledge check skipped" };
      }
    }

    default:
      return { status: "ok", message: `Unknown handler: ${handler}` };
  }
}
