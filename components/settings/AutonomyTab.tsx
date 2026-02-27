"use client";

import { useCallback, useEffect, useState } from "react";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Save } from "lucide-react";

type AutonomyState = {
  settings: {
    enabled: boolean;
    maxDispatchPerTick: number;
    maxActiveWorkers: number;
    taskDueWindowHours: number;
    dispatchCooldownMinutes: number;
    requireCleanApprovalQueue: boolean;
    channelPlatform: string;
    externalUserId: string;
    agentId: string;
  };
  metrics: {
    todo: number;
    inProgress: number;
    blocked: number;
    done: number;
    total: number;
    activeWorkers: number;
    pendingApprovals: number;
    autonomySessions: number;
  };
  runtime: {
    lastDispatchAt: number | null;
    lastTickAt: number | null;
    cooldownActive: boolean;
    cooldownUntil: number | null;
  };
};

const DEFAULT_STATE: AutonomyState = {
  settings: {
    enabled: false,
    maxDispatchPerTick: 2,
    maxActiveWorkers: 4,
    taskDueWindowHours: 72,
    dispatchCooldownMinutes: 10,
    requireCleanApprovalQueue: false,
    channelPlatform: "hub",
    externalUserId: "autonomy:orchestrator",
    agentId: "",
  },
  metrics: {
    todo: 0,
    inProgress: 0,
    blocked: 0,
    done: 0,
    total: 0,
    activeWorkers: 0,
    pendingApprovals: 0,
    autonomySessions: 0,
  },
  runtime: {
    lastDispatchAt: null,
    lastTickAt: null,
    cooldownActive: false,
    cooldownUntil: null,
  },
};

function formatTime(ts: number | null): string {
  if (!ts) return "Never";
  return new Date(ts).toLocaleString();
}

export function AutonomyTab() {
  const [state, setState] = useState<AutonomyState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await gatewayFetch("/api/autonomy");
      if (!res.ok) throw new Error("Failed to fetch autonomy settings");
      const data = await res.json();
      setState(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load autonomy settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await gatewayFetch("/api/autonomy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state.settings),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to save autonomy settings");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setError("");
    try {
      const res = await gatewayFetch("/api/autonomy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "run_once" }),
      });
      if (!res.ok) throw new Error("Failed to trigger autonomy run");
      setTimeout(() => {
        void load();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || "Failed to trigger autonomy run");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 text-sm text-zinc-400">
        Loading autonomy settings...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-zinc-200 text-base">Autonomous Orchestration</CardTitle>
          <p className="text-sm text-zinc-400">
            Dispatches high-priority TODO tasks into controlled autonomy sessions on a schedule.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={state.settings.enabled ? "default" : "outline"}
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  settings: { ...prev.settings, enabled: !prev.settings.enabled },
                }))
              }
            >
              {state.settings.enabled ? "Enabled" : "Disabled"}
            </Button>
            <Button type="button" variant="outline" onClick={runNow} disabled={running}>
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Run Once
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Settings
            </Button>
            <Badge variant={state.runtime.cooldownActive ? "secondary" : "outline"}>
              {state.runtime.cooldownActive ? "Cooldown Active" : "Ready"}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Max Dispatch / Tick</label>
              <Input
                type="number"
                min={1}
                max={20}
                value={state.settings.maxDispatchPerTick}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, maxDispatchPerTick: Number(e.target.value || 1) },
                  }))
                }
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Max Active Workers</label>
              <Input
                type="number"
                min={1}
                max={50}
                value={state.settings.maxActiveWorkers}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, maxActiveWorkers: Number(e.target.value || 1) },
                  }))
                }
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Task Due Window (hours)</label>
              <Input
                type="number"
                min={1}
                max={720}
                value={state.settings.taskDueWindowHours}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, taskDueWindowHours: Number(e.target.value || 1) },
                  }))
                }
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Dispatch Cooldown (minutes)</label>
              <Input
                type="number"
                min={1}
                max={1440}
                value={state.settings.dispatchCooldownMinutes}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, dispatchCooldownMinutes: Number(e.target.value || 1) },
                  }))
                }
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Channel Platform</label>
              <Select
                value={state.settings.channelPlatform}
                onValueChange={(value) =>
                  setState((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, channelPlatform: value },
                  }))
                }
              >
                <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hub">hub</SelectItem>
                  <SelectItem value="api">api</SelectItem>
                  <SelectItem value="custom">custom</SelectItem>
                  <SelectItem value="telegram">telegram</SelectItem>
                  <SelectItem value="whatsapp">whatsapp</SelectItem>
                  <SelectItem value="discord">discord</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={state.settings.requireCleanApprovalQueue}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, requireCleanApprovalQueue: e.target.checked },
                    }))
                  }
                />
                Require empty approval queue before dispatch
              </label>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Autonomy External User ID</label>
              <Input
                value={state.settings.externalUserId}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, externalUserId: e.target.value },
                  }))
                }
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Forced Agent ID (optional)</label>
              <Input
                placeholder="Use channel default if empty"
                value={state.settings.agentId}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, agentId: e.target.value },
                  }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-zinc-200 text-base">Runtime</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-zinc-300">
          <div>Last Tick: {formatTime(state.runtime.lastTickAt)}</div>
          <div>Last Dispatch: {formatTime(state.runtime.lastDispatchAt)}</div>
          <div>Cooldown Until: {formatTime(state.runtime.cooldownUntil)}</div>
          <div>Autonomy Sessions: {state.metrics.autonomySessions}</div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-zinc-200 text-base">Task + Queue Metrics</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-zinc-300">
          <div>TODO: {state.metrics.todo}</div>
          <div>In Progress: {state.metrics.inProgress}</div>
          <div>Blocked: {state.metrics.blocked}</div>
          <div>Done: {state.metrics.done}</div>
          <div>Total: {state.metrics.total}</div>
          <div>Active Workers: {state.metrics.activeWorkers}</div>
          <div>Pending Approvals: {state.metrics.pendingApprovals}</div>
        </CardContent>
      </Card>
    </div>
  );
}
