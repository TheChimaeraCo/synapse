"use client";

import { useFetch } from "@/lib/hooks";
import { formatRelativeTime } from "@/lib/utils";
import { Bot, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

interface WorkerAgent {
  _id: string;
  name: string;
  status: string;
  task?: string;
  model?: string;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export function RecentConversations() {
  const { data: workers } = useFetch<WorkerAgent[]>("/api/agents/workers", 10000);

  const workerList = Array.isArray(workers) ? workers : (workers as any)?.workers || (workers as any)?.data || [];
  const sorted = [...workerList].sort((a: WorkerAgent, b: WorkerAgent) => {
    const aTime = a.completedAt || a.startedAt || 0;
    const bTime = b.completedAt || b.startedAt || 0;
    return bTime - aTime;
  });

  return (
    <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-zinc-200">Agent Activity</h3>
          <p className="text-xs text-zinc-500">Sub-agents &amp; workers</p>
        </div>
        {sorted.filter(w => w.status === "running").length > 0 && (
          <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
            {sorted.filter(w => w.status === "running").length} running
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Bot className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-600">No agent activity yet</p>
            <p className="text-[10px] text-zinc-700 mt-1">Sub-agents will appear here when spawned</p>
          </div>
        </div>
      ) : (
        <div className="space-y-1 flex-1 overflow-auto">
          {sorted.slice(0, 8).map((agent, i) => (
            <div
              key={agent._id}
              className={`flex items-start gap-3 px-3 py-2.5 -mx-2 rounded-lg transition-all ${
                agent.status === "running" ? "bg-blue-500/[0.04] border border-blue-500/10" : "hover:bg-white/[0.04]"
              }`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="mt-0.5 flex-shrink-0">
                {agent.status === "running" ? (
                  <div className="w-7 h-7 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                  </div>
                ) : agent.status === "completed" || agent.status === "done" ? (
                  <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                ) : agent.status === "error" || agent.status === "failed" ? (
                  <div className="w-7 h-7 rounded-full bg-red-500/10 flex items-center justify-center">
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-300 truncate">
                    {agent.name || "Worker Agent"}
                  </span>
                  {agent.model && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-zinc-500">
                      {agent.model.split("/").pop()?.split("-").slice(0, 2).join("-") || agent.model}
                    </span>
                  )}
                </div>
                {agent.task && (
                  <p className="text-[11px] text-zinc-500 truncate mt-0.5">{agent.task}</p>
                )}
                {agent.error && (
                  <p className="text-[11px] text-red-400/70 truncate mt-0.5">{agent.error}</p>
                )}
                <span className="text-[10px] text-zinc-600 mt-0.5 block">
                  {agent.status === "running" && agent.startedAt
                    ? `Running for ${formatRelativeTime(agent.startedAt)}`
                    : agent.completedAt
                    ? formatRelativeTime(agent.completedAt)
                    : agent.startedAt
                    ? formatRelativeTime(agent.startedAt)
                    : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
