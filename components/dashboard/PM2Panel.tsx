"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Play, Square, RotateCcw, FileText, Trash2, Server, ExternalLink,
} from "lucide-react";
import { PM2LogViewer } from "./PM2LogViewer";

interface PM2Process {
  name: string;
  pm_id: number;
  pid: number;
  pm2_env: {
    status: string;
    pm_uptime: number;
    restart_time: number;
  };
  monit: {
    cpu: number;
    memory: number;
  };
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "bg-green-500/20 text-green-400 border-green-500/30",
    stopped: "bg-red-500/20 text-red-400 border-red-500/30",
    errored: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    launching: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };
  return (
    <Badge className={`text-[10px] px-1.5 py-0 border ${colors[status] || "bg-white/[0.06] text-zinc-400 border-white/[0.08]"}`}>
      {status}
    </Badge>
  );
}

function formatUptime(uptime: number) {
  const ms = Date.now() - uptime;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

function formatMem(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function PM2Panel() {
  const [procs, setProcs] = useState<PM2Process[] | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [logProcess, setLogProcess] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchProcs = useCallback(async () => {
    try {
      const res = await gatewayFetch("/api/pm2");
      if (res.ok) setProcs(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchProcs();
    const interval = setInterval(fetchProcs, 10000);
    return () => clearInterval(interval);
  }, [fetchProcs]);

  const doAction = async (action: string, name: string) => {
    setActing(name);
    try {
      await gatewayFetch("/api/pm2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, name }),
      });
      await new Promise(r => setTimeout(r, 1000));
      await fetchProcs();
    } catch {} finally {
      setActing(null);
      setConfirmDelete(null);
    }
  };

  if (procs && procs.length === 0) return null;

  return (
    <>
      <Card className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-400" />
            PM2 Processes
          </CardTitle>
          {procs && (
            <span className="text-xs text-zinc-500">{procs.length} process{procs.length !== 1 ? "es" : ""}</span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!procs ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : procs.length === 0 ? null : (
            <div className="divide-y divide-white/5">
              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_60px_70px_50px_60px_auto] gap-2 px-4 py-2 text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                <span>Name</span><span>Status</span><span>CPU</span><span>Memory</span><span>Up</span><span>↻</span><span>Actions</span>
              </div>
              {procs.map((p) => (
                <div key={p.pm_id} className="grid grid-cols-[1fr_80px_60px_70px_50px_60px_auto] gap-2 px-4 py-2 items-center hover:bg-white/5 transition-colors">
                  <span className="text-sm text-zinc-200 truncate font-medium">{p.name}</span>
                  <StatusBadge status={p.pm2_env?.status} />
                  <span className="text-xs text-zinc-400">{p.monit?.cpu ?? 0}%</span>
                  <span className="text-xs text-zinc-400">{formatMem(p.monit?.memory || 0)}</span>
                  <span className="text-xs text-zinc-500">
                    {p.pm2_env?.status === "online" ? formatUptime(p.pm2_env.pm_uptime) : "-"}
                  </span>
                  <span className="text-xs text-zinc-500">{p.pm2_env?.restart_time || 0}</span>
                  <div className="flex items-center gap-1">
                    {p.pm2_env?.status === "online" ? (
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-400 hover:text-red-400"
                        onClick={() => doAction("stop", p.name)} disabled={acting === p.name}>
                        <Square className="w-3 h-3" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-400 hover:text-green-400"
                        onClick={() => doAction("start", p.name)} disabled={acting === p.name}>
                        <Play className="w-3 h-3" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-400 hover:text-blue-400"
                      onClick={() => doAction("restart", p.name)} disabled={acting === p.name}>
                      <RotateCcw className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-400 hover:text-purple-400"
                      onClick={() => setLogProcess(p.name)}>
                      <FileText className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-400 hover:text-cyan-400"
                      onClick={() => window.open(`/console/${encodeURIComponent(p.name)}`, `${p.name}-console`, 'width=900,height=600,menubar=no,toolbar=no,location=no,status=no')}
                      title="Popout console">
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                    {confirmDelete === p.name ? (
                      <Button size="sm" variant="ghost" className="h-6 px-1 text-[10px] text-red-400 hover:text-red-300"
                        onClick={() => doAction("delete", p.name)}>
                        Confirm
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-400 hover:text-red-400"
                        onClick={() => setConfirmDelete(p.name)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {logProcess && (
        <PM2LogViewer processName={logProcess} open={!!logProcess} onClose={() => setLogProcess(null)} />
      )}
    </>
  );
}
