"use client";

import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { cn } from "@/lib/utils";

const statusConfig = {
  connected: { color: "bg-green-500", shadow: "shadow-green-500/50", label: "Connected" },
  slow: { color: "bg-yellow-500", shadow: "shadow-yellow-500/50", label: "Slow" },
  disconnected: { color: "bg-red-500", shadow: "shadow-red-500/50", label: "Disconnected" },
  reconnecting: { color: "bg-yellow-500", shadow: "shadow-yellow-500/50", label: "Reconnecting" },
};

export function ConnectionStatus() {
  const { status, latencyMs, lastChecked } = useConnectionStatus();
  const config = statusConfig[status];

  const tooltip = [
    config.label,
    latencyMs !== null ? `Latency: ${latencyMs}ms` : null,
    lastChecked ? `Last check: ${lastChecked.toLocaleTimeString()}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <div className="flex items-center gap-2 text-[11px] text-zinc-500" title={tooltip}>
      <span className="relative flex h-2 w-2">
        {(status === "connected" || status === "reconnecting") && (
          <span
            className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              status === "reconnecting" ? "bg-yellow-400" : "bg-green-400"
            )}
          />
        )}
        <span className={cn("relative inline-flex rounded-full h-2 w-2 shadow-sm", config.color, config.shadow)} />
      </span>
      <span>{config.label}</span>
      {latencyMs !== null && <span className="font-mono">{latencyMs}ms</span>}
    </div>
  );
}
