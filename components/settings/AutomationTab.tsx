"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Heart, Plus, Trash2, RefreshCw, Zap, Clock, AlertTriangle,
  CheckCircle, XCircle, ChevronDown, ChevronUp, Loader2
} from "lucide-react";

interface HeartbeatModule {
  _id: string;
  name: string;
  description: string;
  enabled: boolean;
  intervalMinutes: number;
  handler: string;
  lastRunAt?: number;
  lastResult?: string;
  lastStatus?: "ok" | "alert" | "error";
  order: number;
}

interface HeartbeatRun {
  _id: string;
  startedAt: number;
  completedAt?: number;
  modulesRun: number;
  alerts: number;
  results: Record<string, { status: string; message: string }>;
}

interface CronJob {
  _id: string;
  label: string;
  schedule: string;
  prompt: string;
  enabled: boolean;
  lastRunAt?: number;
  lastResult?: string;
  lastStatus?: "ok" | "error";
  createdAt: number;
}

const INTERVAL_OPTIONS = [
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hr", value: 60 },
  { label: "4 hr", value: 240 },
];

const PROACTIVE_KEYS = [
  "proactive.enabled",
  "proactive.mode",
  "proactive.max_messages_per_day",
  "proactive.min_hours_between",
  "proactive.quiet_hours_start",
  "proactive.quiet_hours_end",
  "proactive.timezone",
  "proactive.allowed_platforms",
] as const;

const DEFAULT_PROACTIVE = {
  enabled: false,
  mode: "followups_only",
  maxMessagesPerDay: "2",
  minHoursBetween: "8",
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  timezone: "UTC",
  allowedPlatforms: "hub,telegram,whatsapp,api,custom",
};

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <Badge variant="outline" className="text-zinc-500 border-white/[0.08]">Never run</Badge>;
  if (status === "ok") return <Badge className="bg-emerald-900/50 text-emerald-400 border-emerald-700">OK</Badge>;
  if (status === "alert") return <Badge className="bg-amber-900/50 text-amber-400 border-amber-700">Alert</Badge>;
  return <Badge className="bg-red-900/50 text-red-400 border-red-700">Error</Badge>;
}

function timeAgo(ts?: number): string {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

function describeCron(schedule: string): string {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return schedule;
  const [min, hour] = parts;
  if (min.startsWith("*/")) return `Every ${min.slice(2)} minutes`;
  if (hour.startsWith("*/")) return `Every ${hour.slice(2)} hours`;
  if (min === "0" && hour === "*") return "Every hour";
  if (min === "0" && hour !== "*") return `Daily at ${hour}:00 UTC`;
  return schedule;
}

export function AutomationTab() {
  const [gatewayId, setGatewayId] = useState<string | null>(null);
  const [modules, setModules] = useState<HeartbeatModule[]>([]);
  const [runs, setRuns] = useState<HeartbeatRun[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [newCron, setNewCron] = useState({ label: "", schedule: "", prompt: "" });
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [savingProactive, setSavingProactive] = useState(false);
  const [proactive, setProactive] = useState(DEFAULT_PROACTIVE);

  const loadProactive = useCallback(async () => {
    try {
      const keys = PROACTIVE_KEYS.join(",");
      const res = await gatewayFetch(`/api/config?keys=${encodeURIComponent(keys)}`);
      if (!res.ok) return;
      const data = await res.json();
      setProactive({
        enabled: String(data["proactive.enabled"] || "").toLowerCase() === "true",
        mode: data["proactive.mode"] || DEFAULT_PROACTIVE.mode,
        maxMessagesPerDay: data["proactive.max_messages_per_day"] || DEFAULT_PROACTIVE.maxMessagesPerDay,
        minHoursBetween: data["proactive.min_hours_between"] || DEFAULT_PROACTIVE.minHoursBetween,
        quietHoursStart: data["proactive.quiet_hours_start"] || DEFAULT_PROACTIVE.quietHoursStart,
        quietHoursEnd: data["proactive.quiet_hours_end"] || DEFAULT_PROACTIVE.quietHoursEnd,
        timezone: data["proactive.timezone"] || DEFAULT_PROACTIVE.timezone,
        allowedPlatforms: data["proactive.allowed_platforms"] || DEFAULT_PROACTIVE.allowedPlatforms,
      });
    } catch (e) {
      console.error("Failed to load proactive settings:", e);
    }
  }, []);

  const saveProactive = async () => {
    setSavingProactive(true);
    try {
      const entries: Array<[string, string]> = [
        ["proactive.enabled", proactive.enabled ? "true" : "false"],
        ["proactive.mode", proactive.mode || "followups_only"],
        ["proactive.max_messages_per_day", proactive.maxMessagesPerDay || "2"],
        ["proactive.min_hours_between", proactive.minHoursBetween || "8"],
        ["proactive.quiet_hours_start", proactive.quietHoursStart || "22:00"],
        ["proactive.quiet_hours_end", proactive.quietHoursEnd || "08:00"],
        ["proactive.timezone", proactive.timezone || "UTC"],
        ["proactive.allowed_platforms", proactive.allowedPlatforms || DEFAULT_PROACTIVE.allowedPlatforms],
      ];

      for (const [key, value] of entries) {
        const res = await gatewayFetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
        if (!res.ok) throw new Error(`Failed to save ${key}`);
      }
    } catch (e) {
      console.error("Failed to save proactive settings:", e);
    } finally {
      setSavingProactive(false);
    }
  };

  const fetchData = useCallback(async (gId?: string) => {
    try {
      const id = gId || gatewayId;
      if (!id) {
        // Get gateway first
        const gRes = await gatewayFetch("/api/config?prefix=gateway.");
        const gData = await gRes.json();
        // Try to get from settings or just fetch heartbeat with auto-detect
        const res = await gatewayFetch("/api/heartbeat/seed", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const seedData = await res.json();
        // If we don't have gatewayId, we need to get it from somewhere
      }
      if (!id) return;

      const res = await gatewayFetch(`/api/heartbeat?gatewayId=${id}`);
      const data = await res.json();
      if (data.modules) setModules(data.modules);
      if (data.runs) setRuns(data.runs);
      if (data.cronJobs) setCronJobs(data.cronJobs);
    } catch (e) {
      console.error("Failed to fetch heartbeat data:", e);
    } finally {
      setLoading(false);
    }
  }, [gatewayId]);

  useEffect(() => {
    // Auto-detect gateway
    gatewayFetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        const gId = d.gatewayId || d.gateway?._id;
        if (gId) {
          setGatewayId(gId);
          fetchData(gId);
          loadProactive();
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, [fetchData, loadProactive]);

  const toggleModule = async (mod: HeartbeatModule) => {
    setSaving(mod._id);
    try {
      await gatewayFetch("/api/heartbeat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "module", id: mod._id, enabled: !mod.enabled }),
      });
      setModules((prev) => prev.map((m) => m._id === mod._id ? { ...m, enabled: !m.enabled } : m));
    } finally {
      setSaving(null);
    }
  };

  const updateInterval = async (mod: HeartbeatModule, intervalMinutes: number) => {
    setSaving(mod._id);
    try {
      await gatewayFetch("/api/heartbeat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "module", id: mod._id, intervalMinutes }),
      });
      setModules((prev) => prev.map((m) => m._id === mod._id ? { ...m, intervalMinutes } : m));
    } finally {
      setSaving(null);
    }
  };

  const seedDefaults = async () => {
    if (!gatewayId) return;
    setSeeding(true);
    try {
      await gatewayFetch("/api/heartbeat/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gatewayId }),
      });
      await fetchData(gatewayId);
    } finally {
      setSeeding(false);
    }
  };

  const addCronJob = async () => {
    if (!gatewayId || !newCron.label || !newCron.schedule || !newCron.prompt) return;
    try {
      await gatewayFetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "cronJob", gatewayId, ...newCron, enabled: true }),
      });
      setNewCron({ label: "", schedule: "", prompt: "" });
      await fetchData(gatewayId);
    } catch (e) {
      console.error("Failed to add cron job:", e);
    }
  };

  const deleteCronJob = async (id: string) => {
    try {
      await gatewayFetch("/api/heartbeat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "cronJob", id }),
      });
      setCronJobs((prev) => prev.filter((j) => j._id !== id));
    } catch (e) {
      console.error("Failed to delete cron job:", e);
    }
  };

  const toggleCronJob = async (job: CronJob) => {
    try {
      await gatewayFetch("/api/heartbeat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "cronJob", id: job._id, gatewayId, label: job.label, schedule: job.schedule, prompt: job.prompt, enabled: !job.enabled }),
      });
      setCronJobs((prev) => prev.map((j) => j._id === job._id ? { ...j, enabled: !j.enabled } : j));
    } catch (e) {
      console.error("Failed to toggle cron job:", e);
    }
  };

  if (loading) return <div className="text-zinc-400 p-4">Loading...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Automation</h2>
        <p className="text-sm text-zinc-400">Heartbeat engine, cron jobs, and webhooks - all Convex-native.</p>
      </div>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-3">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-blue-400" />
            Proactive Follow-ups
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.04] border border-white/[0.08]/50">
            <div>
              <p className="text-sm text-zinc-200 font-medium">Enable proactive follow-ups</p>
              <p className="text-xs text-zinc-500">When due, Synapse can send a check-in message without waiting for a user prompt.</p>
            </div>
            <button
              onClick={() => setProactive((p) => ({ ...p, enabled: !p.enabled }))}
              className={`w-11 h-6 rounded-full transition-colors relative ${proactive.enabled ? "bg-gradient-to-r from-blue-500 to-purple-500 shadow-[0_0_12px_rgba(59,130,246,0.25)]" : "bg-white/[0.12]"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${proactive.enabled ? "left-5.5" : "left-0.5"}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Mode</p>
              <Select
                value={proactive.mode}
                onValueChange={(value) => setProactive((p) => ({ ...p, mode: value }))}
              >
                <SelectTrigger className="h-9 bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="followups_only">Follow-ups Only</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Timezone</p>
              <Input
                value={proactive.timezone}
                onChange={(e) => setProactive((p) => ({ ...p, timezone: e.target.value }))}
                placeholder="America/New_York"
                className="bg-white/[0.06] border-white/[0.08] text-zinc-200"
              />
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Max proactive messages/day</p>
              <Input
                type="number"
                min={1}
                max={20}
                value={proactive.maxMessagesPerDay}
                onChange={(e) => setProactive((p) => ({ ...p, maxMessagesPerDay: e.target.value }))}
                className="bg-white/[0.06] border-white/[0.08] text-zinc-200"
              />
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Minimum hours between proactive messages</p>
              <Input
                type="number"
                min={1}
                max={48}
                value={proactive.minHoursBetween}
                onChange={(e) => setProactive((p) => ({ ...p, minHoursBetween: e.target.value }))}
                className="bg-white/[0.06] border-white/[0.08] text-zinc-200"
              />
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Quiet hours start (HH:MM)</p>
              <Input
                value={proactive.quietHoursStart}
                onChange={(e) => setProactive((p) => ({ ...p, quietHoursStart: e.target.value }))}
                placeholder="22:00"
                className="bg-white/[0.06] border-white/[0.08] text-zinc-200"
              />
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Quiet hours end (HH:MM)</p>
              <Input
                value={proactive.quietHoursEnd}
                onChange={(e) => setProactive((p) => ({ ...p, quietHoursEnd: e.target.value }))}
                placeholder="08:00"
                className="bg-white/[0.06] border-white/[0.08] text-zinc-200"
              />
            </div>
          </div>

          <div>
            <p className="text-xs text-zinc-500 mb-1">Allowed platforms (comma-separated)</p>
            <Input
              value={proactive.allowedPlatforms}
              onChange={(e) => setProactive((p) => ({ ...p, allowedPlatforms: e.target.value }))}
              placeholder="hub,telegram,whatsapp,api,custom"
              className="bg-white/[0.06] border-white/[0.08] text-zinc-200"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={saveProactive} disabled={savingProactive}>
              {savingProactive ? "Saving..." : "Save Proactive Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Heartbeat Modules */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-white flex items-center gap-2">
            <Heart className="h-5 w-5 text-blue-400" />
            Heartbeat Modules
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]" onClick={seedDefaults} disabled={seeding}>
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              <span className="ml-1">Seed Defaults</span>
            </Button>
            <Button size="sm" variant="outline" className="border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]" onClick={() => gatewayId && fetchData(gatewayId)}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {modules.length === 0 ? (
            <p className="text-zinc-500 text-sm">No heartbeat modules configured. Click "Seed Defaults" to create the standard checks.</p>
          ) : (
            modules.sort((a, b) => a.order - b.order).map((mod) => (
              <div key={mod._id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.04] border border-white/[0.08]/50">
                <button
                  onClick={() => toggleModule(mod)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${mod.enabled ? "bg-gradient-to-r from-blue-500 to-purple-500 shadow-[0_0_12px_rgba(59,130,246,0.25)]" : "bg-white/[0.12]"}`}
                  disabled={saving === mod._id}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${mod.enabled ? "left-5" : "left-0.5"}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{mod.name.replace(/_/g, " ")}</span>
                    <StatusBadge status={mod.lastStatus} />
                  </div>
                  <p className="text-xs text-zinc-500 truncate">{mod.description}</p>
                  {mod.lastResult && (
                    <p className="text-xs text-zinc-400 mt-0.5">{mod.lastResult}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-zinc-500" />
                  <Select value={String(mod.intervalMinutes)} onValueChange={(val) => updateInterval(mod, parseInt(val))}>
                    <SelectTrigger className="h-7 w-24 bg-white/[0.04] border-white/[0.08] text-zinc-300 rounded-xl text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVAL_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-zinc-500 w-16 text-right">{timeAgo(mod.lastRunAt)}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Recent Runs */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-3">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4 text-blue-400" />
            Recent Heartbeat Runs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.length === 0 ? (
            <p className="text-zinc-500 text-sm">No heartbeat runs yet. The cron fires every 5 minutes.</p>
          ) : (
            runs.map((run) => (
              <div key={run._id} className="rounded-lg bg-white/[0.04] border border-white/[0.08]/50">
                <button
                  onClick={() => setExpandedRun(expandedRun === run._id ? null : run._id)}
                  className="w-full flex items-center gap-3 p-3 text-left"
                >
                  {run.alerts > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                  )}
                  <span className="text-sm text-zinc-300">
                    {new Date(run.startedAt).toLocaleString()} - {run.modulesRun} modules
                  </span>
                  {run.alerts > 0 && (
                    <Badge className="bg-amber-900/50 text-amber-400 border-amber-700">{run.alerts} alert{run.alerts > 1 ? "s" : ""}</Badge>
                  )}
                  <span className="text-xs text-zinc-500 ml-auto">
                    {run.completedAt ? `${run.completedAt - run.startedAt}ms` : "..."}
                  </span>
                  {expandedRun === run._id ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
                </button>
                {expandedRun === run._id && run.results && (
                  <div className="px-3 pb-3 space-y-1">
                    {Object.entries(run.results).map(([name, r]: [string, any]) => (
                      <div key={name} className="flex items-center gap-2 text-xs">
                        {r.status === "ok" ? (
                          <CheckCircle className="h-3 w-3 text-emerald-400" />
                        ) : r.status === "alert" ? (
                          <AlertTriangle className="h-3 w-3 text-amber-400" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-400" />
                        )}
                        <span className="text-zinc-400 font-medium w-32">{name.replace(/_/g, " ")}</span>
                        <span className="text-zinc-500">{r.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Cron Jobs */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-3">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-blue-400" />
            Cron Jobs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {cronJobs.map((job) => (
            <div key={job._id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.04] border border-white/[0.08]/50">
              <button
                onClick={() => toggleCronJob(job)}
                className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${job.enabled ? "bg-gradient-to-r from-blue-500 to-purple-500 shadow-[0_0_12px_rgba(59,130,246,0.25)]" : "bg-white/[0.12]"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${job.enabled ? "left-5" : "left-0.5"}`} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{job.label}</span>
                  <span className="text-xs text-zinc-500">{describeCron(job.schedule)}</span>
                  {job.lastStatus && <StatusBadge status={job.lastStatus} />}
                </div>
                <p className="text-xs text-zinc-500 truncate">{job.prompt}</p>
              </div>
              <span className="text-xs text-zinc-500">{timeAgo(job.lastRunAt)}</span>
              <button onClick={() => deleteCronJob(job._id)} className="text-zinc-500 hover:text-red-400">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          <div className="pt-2 border-t border-white/[0.06] space-y-2">
            <p className="text-xs text-zinc-500 font-medium">Add Cron Job</p>
            <div className="grid grid-cols-3 gap-2">
              <Input
                placeholder="Label"
                value={newCron.label}
                onChange={(e) => setNewCron({ ...newCron, label: e.target.value })}
                className="bg-white/[0.06] border-white/[0.08] text-zinc-200"
              />
              <Input
                placeholder="*/30 * * * *"
                value={newCron.schedule}
                onChange={(e) => setNewCron({ ...newCron, schedule: e.target.value })}
                className="bg-white/[0.06] border-white/[0.08] text-zinc-200"
              />
              <Button size="sm" onClick={addCronJob} disabled={!newCron.label || !newCron.schedule || !newCron.prompt}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
            <Textarea
              placeholder="Prompt / command to execute..."
              value={newCron.prompt}
              onChange={(e) => setNewCron({ ...newCron, prompt: e.target.value })}
              rows={2}
              className="bg-white/[0.06] border-white/[0.08] text-zinc-200"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
