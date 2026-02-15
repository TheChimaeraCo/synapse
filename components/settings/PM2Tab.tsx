"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Play, Square, RotateCcw, FileText, Trash2, Plus, Server, RefreshCw,
} from "lucide-react";
import { PM2LogViewer } from "@/components/dashboard/PM2LogViewer";

interface PM2Process {
  name: string;
  pm_id: number;
  pid: number;
  pm2_env: any;
  monit: { cpu: number; memory: number };
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "bg-green-500/20 text-green-400 border-green-500/30",
    stopped: "bg-red-500/20 text-red-400 border-red-500/30",
    errored: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  return (
    <Badge className={`text-[10px] px-1.5 py-0 border ${colors[status] || "bg-white/[0.06] text-zinc-400 border-white/[0.08]"}`}>
      {status}
    </Badge>
  );
}

export function PM2Tab() {
  const [procs, setProcs] = useState<PM2Process[] | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [logProcess, setLogProcess] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", script: "", cwd: "", interpreter: "node", args: "" });
  const [newError, setNewError] = useState("");

  const fetchProcs = useCallback(async () => {
    try {
      const res = await gatewayFetch("/api/pm2");
      if (res.ok) setProcs(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchProcs(); }, [fetchProcs]);

  const doAction = async (action: string, name: string, extra?: any) => {
    setActing(name);
    try {
      const res = await gatewayFetch("/api/pm2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, name, ...extra }),
      });
      if (!res.ok) {
        const data = await res.json();
        setNewError(data.error || "Action failed");
      }
      await new Promise(r => setTimeout(r, 1000));
      await fetchProcs();
    } catch (e: any) { setNewError(e.message); }
    finally { setActing(null); setConfirmDelete(null); }
  };

  const handleCreate = async () => {
    if (!newForm.script) { setNewError("Script path is required"); return; }
    setNewError("");
    await doAction("start", newForm.name || newForm.script, {
      script: newForm.script,
      cwd: newForm.cwd || undefined,
      interpreter: newForm.interpreter || undefined,
      args: newForm.args || undefined,
    });
    setShowNew(false);
    setNewForm({ name: "", script: "", cwd: "", interpreter: "node", args: "" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-200">PM2 Process Manager</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchProcs} className="border-white/[0.08] text-zinc-300">
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowNew(!showNew)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New Process
          </Button>
        </div>
      </div>

      {/* New Process Form */}
      {showNew && (
        <Card className="bg-white/[0.04] border-white/[0.08]">
          <CardHeader><CardTitle className="text-sm text-zinc-300">Start New Process</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-400 text-xs">Name</Label>
                <Input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="my-app" className="bg-white/[0.06] border-white/[0.08] text-zinc-200 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Script Path *</Label>
                <Input value={newForm.script} onChange={e => setNewForm(f => ({ ...f, script: e.target.value }))}
                  placeholder="/path/to/app.js" className="bg-white/[0.06] border-white/[0.08] text-zinc-200 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Working Directory</Label>
                <Input value={newForm.cwd} onChange={e => setNewForm(f => ({ ...f, cwd: e.target.value }))}
                  placeholder="/path/to/project" className="bg-white/[0.06] border-white/[0.08] text-zinc-200 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Interpreter</Label>
                <Input value={newForm.interpreter} onChange={e => setNewForm(f => ({ ...f, interpreter: e.target.value }))}
                  className="bg-white/[0.06] border-white/[0.08] text-zinc-200 h-8 text-sm" />
              </div>
              <div className="col-span-2">
                <Label className="text-zinc-400 text-xs">Arguments</Label>
                <Input value={newForm.args} onChange={e => setNewForm(f => ({ ...f, args: e.target.value }))}
                  placeholder="--port 8080" className="bg-white/[0.06] border-white/[0.08] text-zinc-200 h-8 text-sm" />
              </div>
            </div>
            {newError && <p className="text-xs text-red-400">{newError}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} className="bg-green-600 hover:bg-green-700">Start</Button>
              <Button size="sm" variant="outline" onClick={() => setShowNew(false)} className="border-white/[0.08] text-zinc-300">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Process List */}
      <Card className="bg-white/[0.04] border-white/[0.08]">
        <CardContent className="p-0">
          {!procs ? (
            <div className="p-8 text-center text-zinc-500">Loading...</div>
          ) : procs.length === 0 ? (
            <div className="p-8 text-center">
              <Server className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No PM2 processes</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-xs text-zinc-500 uppercase">
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">ID</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">PID</th>
                  <th className="text-left p-3">CPU</th>
                  <th className="text-left p-3">Memory</th>
                  <th className="text-left p-3">Restarts</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {procs.map(p => (
                  <tr key={p.pm_id} className="border-b border-white/[0.06]/50 hover:bg-white/5">
                    <td className="p-3 text-zinc-200 font-medium">{p.name}</td>
                    <td className="p-3 text-zinc-500">{p.pm_id}</td>
                    <td className="p-3"><StatusBadge status={p.pm2_env?.status} /></td>
                    <td className="p-3 text-zinc-500">{p.pid || "-"}</td>
                    <td className="p-3 text-zinc-400">{p.monit?.cpu ?? 0}%</td>
                    <td className="p-3 text-zinc-400">{((p.monit?.memory || 0) / 1024 / 1024).toFixed(1)}MB</td>
                    <td className="p-3 text-zinc-500">{p.pm2_env?.restart_time || 0}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {p.pm2_env?.status === "online" ? (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-zinc-400 hover:text-red-400"
                            onClick={() => doAction("stop", p.name)} disabled={acting === p.name} title="Stop">
                            <Square className="w-3.5 h-3.5" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-zinc-400 hover:text-green-400"
                            onClick={() => doAction("start", p.name)} disabled={acting === p.name} title="Start">
                            <Play className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-zinc-400 hover:text-blue-400"
                          onClick={() => doAction("restart", p.name)} disabled={acting === p.name} title="Restart">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-zinc-400 hover:text-purple-400"
                          onClick={() => setLogProcess(p.name)} title="Logs">
                          <FileText className="w-3.5 h-3.5" />
                        </Button>
                        {confirmDelete === p.name ? (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-400"
                            onClick={() => doAction("delete", p.name)}>Confirm?</Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-zinc-400 hover:text-red-400"
                            onClick={() => setConfirmDelete(p.name)} title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {logProcess && (
        <PM2LogViewer processName={logProcess} open={!!logProcess} onClose={() => setLogProcess(null)} />
      )}
    </div>
  );
}
