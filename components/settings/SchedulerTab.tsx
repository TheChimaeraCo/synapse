"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Clock, Pause, Play, Trash2, RotateCw } from "lucide-react";

interface ScheduledTask {
  _id: string;
  label: string;
  type: "once" | "recurring";
  cronExpr?: string;
  scheduledAt?: number;
  nextRunAt?: number;
  lastRunAt?: number;
  status: string;
  createdAt: number;
}

export function SchedulerTab() {
  const { data: session } = useSession();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);

  const gatewayId = (session?.user as any)?.gatewayId;

  const fetchTasks = useCallback(async () => {
    if (!gatewayId) return;
    try {
      const res = await gatewayFetch(`/api/scheduler?gatewayId=${gatewayId}`);
      if (res.ok) setTasks(await res.json());
    } catch {}
    setLoading(false);
  }, [gatewayId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const updateTask = async (id: string, body: Record<string, any>) => {
    await gatewayFetch(`/api/scheduler/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    fetchTasks();
  };

  const deleteTask = async (id: string) => {
    await gatewayFetch(`/api/scheduler/${id}`, { method: "DELETE" });
    fetchTasks();
  };

  const statusColor: Record<string, string> = {
    active: "text-green-400",
    paused: "text-yellow-400",
    completed: "text-zinc-500",
    cancelled: "text-red-400",
  };

  if (loading) return <div className="text-zinc-400 text-sm p-4">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Clock className="w-5 h-5" /> Scheduled Tasks & Reminders
        </h2>
        <button onClick={fetchTasks} className="text-zinc-400 hover:text-white p-1">
          <RotateCw className="w-4 h-4" />
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-zinc-500 text-sm">No scheduled tasks. Use the &quot;set_reminder&quot; tool in chat to create one.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task._id} className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${statusColor[task.status] || "text-zinc-400"}`}>
                    {task.status.toUpperCase()}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {task.type === "recurring" ? `recurring (${task.cronExpr})` : "one-time"}
                  </span>
                </div>
                <p className="text-sm text-white truncate">{task.label}</p>
                <p className="text-xs text-zinc-500">
                  {task.nextRunAt ? `Next: ${new Date(task.nextRunAt).toLocaleString()}` : ""}
                  {task.lastRunAt ? ` | Last: ${new Date(task.lastRunAt).toLocaleString()}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 ml-2">
                {task.status === "active" && (
                  <button onClick={() => updateTask(task._id, { status: "paused" })} className="p-1.5 text-zinc-400 hover:text-yellow-400" title="Pause">
                    <Pause className="w-4 h-4" />
                  </button>
                )}
                {task.status === "paused" && (
                  <button onClick={() => updateTask(task._id, { status: "active" })} className="p-1.5 text-zinc-400 hover:text-green-400" title="Resume">
                    <Play className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => deleteTask(task._id)} className="p-1.5 text-zinc-400 hover:text-red-400" title="Cancel">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
