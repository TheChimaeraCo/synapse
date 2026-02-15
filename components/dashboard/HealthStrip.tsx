"use client";

import { useFetch } from "@/lib/hooks";
import { formatRelativeTime } from "@/lib/utils";
import { useState } from "react";
import { Database, Cpu, ChevronDown, ChevronUp } from "lucide-react";

interface HealthData {
  convex: string;
  ai: { status: string; lastSuccess: number | null };
  channels: { id: string; name: string; platform: string; isActive: boolean; lastActivity: number | null }[];
}

function StatusDot({ status }: { status: string }) {
  const ok = status === "healthy" || status === "active";
  return (
    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-green-400" : status === "degraded" ? "bg-yellow-400" : "bg-red-400"}`} />
  );
}

export function HealthStrip() {
  const { data: health } = useFetch<HealthData>("/api/dashboard/health", 30000);
  const [expanded, setExpanded] = useState(false);

  if (!health) return null;

  const items = [
    { icon: Database, label: "Database", status: health.convex, detail: null },
    { icon: Cpu, label: "AI Provider", status: health.ai.status, detail: health.ai.lastSuccess ? `Last: ${formatRelativeTime(health.ai.lastSuccess)}` : null },
  ];

  return (
    <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] px-5 py-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4"
      >
        <span className="text-xs font-medium text-zinc-400">System Health</span>
        <div className="flex items-center gap-3 flex-1">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <StatusDot status={item.status} />
              <span className="text-[11px] text-zinc-500">{item.label}</span>
            </div>
          ))}
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="text-xs text-zinc-400">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {item.detail && <span className="text-[10px] text-zinc-600">{item.detail}</span>}
                  <StatusDot status={item.status} />
                  <span className="text-[10px] text-zinc-400 capitalize">{item.status}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
