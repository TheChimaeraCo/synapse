// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0
export type EscalationLevel = "info" | "warning" | "alert" | "critical";

export interface EscalationResult {
  level: EscalationLevel;
  action: string;
  notify: boolean;
}

const THRESHOLDS = {
  degradedWarningMs: 5 * 60 * 1000,    // 5 min degraded -> warning
  degradedAlertMs: 15 * 60 * 1000,     // 15 min degraded -> alert
  downWarningMs: 0,                      // immediate warning on down
  downAlertMs: 5 * 60 * 1000,          // 5 min down -> alert
  downCriticalMs: 15 * 60 * 1000,      // 15 min down -> critical
};

export function determineLevel(
  component: string,
  status: "healthy" | "degraded" | "down",
  durationMs: number
): EscalationResult {
  if (status === "healthy") {
    return { level: "info", action: "none", notify: false };
  }

  if (status === "degraded") {
    if (durationMs >= THRESHOLDS.degradedAlertMs) {
      return { level: "alert", action: `${component} degraded for ${Math.round(durationMs / 60000)}m - investigate`, notify: true };
    }
    if (durationMs >= THRESHOLDS.degradedWarningMs) {
      return { level: "warning", action: `${component} degraded - monitoring`, notify: true };
    }
    return { level: "info", action: `${component} slightly degraded`, notify: false };
  }

  // status === "down"
  if (durationMs >= THRESHOLDS.downCriticalMs) {
    return { level: "critical", action: `${component} DOWN for ${Math.round(durationMs / 60000)}m - immediate action required`, notify: true };
  }
  if (durationMs >= THRESHOLDS.downAlertMs) {
    return { level: "alert", action: `${component} DOWN - attempting recovery`, notify: true };
  }
  return { level: "warning", action: `${component} DOWN - just detected`, notify: true };
}

export function getLevelColor(level: EscalationLevel): string {
  switch (level) {
    case "info": return "text-blue-400";
    case "warning": return "text-yellow-400";
    case "alert": return "text-orange-400";
    case "critical": return "text-red-400";
  }
}

export function getLevelBadgeColor(level: EscalationLevel): string {
  switch (level) {
    case "info": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case "warning": return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
    case "alert": return "bg-orange-500/10 text-orange-400 border-orange-500/20";
    case "critical": return "bg-red-500/10 text-red-400 border-red-500/20";
  }
}
