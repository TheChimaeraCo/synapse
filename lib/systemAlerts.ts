import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type AlertLevel = "info" | "warning" | "error" | "critical";

export async function createAlert(
  level: AlertLevel,
  message: string,
  source: string,
  gatewayId?: string
) {
  try {
    const convex = getConvexClient();
    await convex.mutation(api.functions.systemAlerts.create, {
      level,
      message,
      source,
      gatewayId: gatewayId ? (gatewayId as Id<"gateways">) : undefined,
    });
  } catch (e) {
    console.error("[systemAlerts] Failed to create alert:", e);
  }
}

// Track failed AI calls for burst detection
let recentFailures: number[] = [];

export function trackAIFailure() {
  const now = Date.now();
  recentFailures.push(now);
  // Keep only last 5 minutes
  recentFailures = recentFailures.filter((t) => now - t < 5 * 60 * 1000);
  if (recentFailures.length >= 3) {
    createAlert(
      "error",
      `${recentFailures.length} AI call failures in the last 5 minutes`,
      "ai-provider"
    );
    recentFailures = []; // Reset after alerting
  }
}
