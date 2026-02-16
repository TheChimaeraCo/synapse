"use client";

import { useFetch } from "@/lib/hooks";
import { Bot, Loader2 } from "lucide-react";

interface Agent {
  _id: string;
  label?: string;
  status?: string;
  progress?: number;
  createdAt?: number;
}

export function ActiveAgents() {
  const { data } = useFetch<{ agents: Agent[] }>("/api/agents/active", 15000);

  const running = data?.agents?.filter((a) => a.status === "running" || a.status === "active") ?? [];

  if (!running.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bot size={16} className="text-blue-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Active Agents</h3>
        <span className="ml-auto text-xs text-zinc-500">{running.length} running</span>
      </div>
      <div className="space-y-2">
        {running.slice(0, 5).map((agent) => (
          <div key={agent._id} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2">
            <Loader2 size={14} className="text-blue-400 animate-spin shrink-0" />
            <span className="text-sm text-zinc-300 truncate">{agent.label || "Sub-agent"}</span>
            {typeof agent.progress === "number" && (
              <span className="ml-auto text-xs text-zinc-500">{Math.round(agent.progress)}%</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
