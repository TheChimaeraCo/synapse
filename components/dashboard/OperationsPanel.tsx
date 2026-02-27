"use client";

import Link from "next/link";
import { formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckSquare, ShieldAlert, Bot, Settings } from "lucide-react";

interface OperationsStats {
  taskCounts?: {
    todo: number;
    inProgress: number;
    blocked: number;
    done: number;
    total: number;
  };
  activeWorkers?: number;
  pendingApprovals?: number;
  autonomy?: {
    enabled?: boolean;
    lastTickAt?: number | null;
    lastDispatchAt?: number | null;
  };
}

function runtimeLabel(ts?: number | null): string {
  if (!ts) return "Never";
  return formatRelativeTime(ts);
}

export function OperationsPanel({ stats }: { stats: OperationsStats }) {
  const taskCounts = stats.taskCounts || {
    todo: 0,
    inProgress: 0,
    blocked: 0,
    done: 0,
    total: 0,
  };
  const activeWorkers = stats.activeWorkers || 0;
  const pendingApprovals = stats.pendingApprovals || 0;
  const autonomyEnabled = !!stats.autonomy?.enabled;

  return (
    <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-medium text-zinc-200">Operations Pulse</h3>
          <p className="text-xs text-zinc-500">Autonomy, tasks, approvals, and worker load</p>
        </div>
        <Badge variant={autonomyEnabled ? "secondary" : "outline"}>
          {autonomyEnabled ? "Autonomy On" : "Autonomy Off"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
            <CheckSquare className="w-3.5 h-3.5" />
            Task Backlog
          </div>
          <p className="text-xl font-semibold text-zinc-100">{taskCounts.todo}</p>
          <p className="text-[11px] text-zinc-500">{taskCounts.inProgress} in progress</p>
        </div>
        <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
            <Bot className="w-3.5 h-3.5" />
            Active Workers
          </div>
          <p className="text-xl font-semibold text-zinc-100">{activeWorkers}</p>
          <p className="text-[11px] text-zinc-500">sub-agents running</p>
        </div>
        <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
            <ShieldAlert className="w-3.5 h-3.5" />
            Pending Approvals
          </div>
          <p className="text-xl font-semibold text-zinc-100">{pendingApprovals}</p>
          <p className="text-[11px] text-zinc-500">tool operations waiting</p>
        </div>
        <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
            <Activity className="w-3.5 h-3.5" />
            Last Dispatch
          </div>
          <p className="text-sm font-semibold text-zinc-100">
            {runtimeLabel(stats.autonomy?.lastDispatchAt)}
          </p>
          <p className="text-[11px] text-zinc-500">
            Tick {runtimeLabel(stats.autonomy?.lastTickAt)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.08] transition-colors"
        >
          <CheckSquare className="w-3.5 h-3.5" />
          Review Tasks
        </Link>
        <Link
          href="/settings?tab=autonomy"
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.08] transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          Autonomy Settings
        </Link>
      </div>
    </div>
  );
}
