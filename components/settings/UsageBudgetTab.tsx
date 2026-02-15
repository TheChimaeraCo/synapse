"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useFetch } from "@/lib/hooks";
import { useSession } from "next-auth/react";

const TASK_TYPES = ["chat", "tool_use", "summary", "code"] as const;

const TASK_LABELS: Record<string, string> = {
  chat: "Chat",
  tool_use: "Tool Use",
  summary: "Summaries",
  code: "Code Generation",
};

function progressColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-yellow-500";
  return "bg-green-500";
}

export function UsageBudgetTab() {
  const { data: session } = useSession();
  const gatewayId = (session?.user as any)?.gatewayId;

  const { data: dashboard } = useFetch<{ stats: any }>(gatewayId ? "/api/dashboard" : null);
  const { data: budget, refetch: refetchBudget } = useFetch<any[]>(gatewayId ? "/api/budget" : null);
  const { data: budgetCheck } = useFetch<any>(gatewayId ? "/api/budget/check" : null);
  const { data: routing, refetch: refetchRouting } = useFetch<Record<string, string>>(
    "/api/config/models/routing"
  );

  const stats = dashboard?.stats;

  const [form, setForm] = useState({
    dailyLimit: 5,
    monthlyLimit: 100,
    action: "warn" as "warn" | "block",
  });
  const [routingForm, setRoutingForm] = useState<Record<string, string>>({
    chat: "claude-sonnet-4-20250514",
    tool_use: "claude-sonnet-4-20250514",
    summary: "claude-haiku-3-20250514",
    code: "claude-sonnet-4-20250514",
  });
  const [saving, setSaving] = useState(false);
  const [savingRouting, setSavingRouting] = useState(false);

  useEffect(() => {
    if (budget && budget.length > 0) {
      setForm((prev) => {
        let dailyLimit = prev.dailyLimit;
        let monthlyLimit = prev.monthlyLimit;
        let action = prev.action;
        for (const b of budget) {
          if (b.period === "daily") dailyLimit = b.limitUsd;
          if (b.period === "monthly") monthlyLimit = b.limitUsd;
          action = b.action;
        }
        return { dailyLimit, monthlyLimit, action };
      });
    }
  }, [budget]);

  useEffect(() => {
    if (routing) {
      setRoutingForm(routing);
    }
  }, [routing]);

  const saveBudget = async () => {
    setSaving(true);
    try {
      const res = await gatewayFetch("/api/settings/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "budget", gatewayId, ...form }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Budget saved");
      refetchBudget();
    } catch {
      toast.error("Failed to save budget");
    } finally {
      setSaving(false);
    }
  };

  const saveRouting = async () => {
    setSavingRouting(true);
    try {
      const res = await gatewayFetch("/api/config/models/routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(routingForm),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Model routing saved");
      refetchRouting();
    } catch {
      toast.error("Failed to save routing");
    } finally {
      setSavingRouting(false);
    }
  };

  const dailySpend = budgetCheck?.dailySpend ?? stats?.todayCost ?? 0;
  const monthlySpend = budgetCheck?.monthlySpend ?? stats?.totalCost ?? 0;
  const dailyPct = form.dailyLimit ? Math.min(100, (dailySpend / form.dailyLimit) * 100) : 0;
  const monthlyPct = form.monthlyLimit ? Math.min(100, (monthlySpend / form.monthlyLimit) * 100) : 0;

  const MODEL_OPTIONS = [
    "claude-sonnet-4-20250514",
    "claude-opus-4-20250514",
    "claude-haiku-3-20250514",
    "gpt-4o",
    "gpt-4o-mini",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Usage & Budget</h2>
        <p className="text-sm text-zinc-400">Monitor usage, set spending limits, and configure model routing.</p>
      </div>

      {/* Budget status banner */}
      {budgetCheck && !budgetCheck.allowed && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
          <p className="text-red-300 text-sm font-medium">Budget Exceeded</p>
          <p className="text-red-400 text-xs">{budgetCheck.reason}</p>
        </div>
      )}
      {budgetCheck?.suggestedModel && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3">
          <p className="text-yellow-300 text-sm font-medium">Approaching Budget Limit</p>
          <p className="text-yellow-400 text-xs">Auto-downgrading to {budgetCheck.suggestedModel} to conserve budget.</p>
        </div>
      )}

      {/* Current usage */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Current Period</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-zinc-400">Today</span>
              <span className="text-white">${dailySpend.toFixed(4)} / ${form.dailyLimit.toFixed(2)}</span>
            </div>
            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <div className={`h-full ${progressColor(dailyPct)} rounded-full transition-all`} style={{ width: `${dailyPct}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-zinc-400">This Month</span>
              <span className="text-white">${monthlySpend.toFixed(4)} / ${form.monthlyLimit.toFixed(2)}</span>
            </div>
            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <div className={`h-full ${progressColor(monthlyPct)} rounded-full transition-all`} style={{ width: `${monthlyPct}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="bg-white/[0.04] rounded-lg p-3">
              <p className="text-zinc-500 text-xs">Messages Today</p>
              <p className="text-white text-lg font-semibold">{stats?.todayMessages?.toLocaleString() || 0}</p>
            </div>
            <div className="bg-white/[0.04] rounded-lg p-3">
              <p className="text-zinc-500 text-xs">Total Messages</p>
              <p className="text-white text-lg font-semibold">{stats?.totalMessages?.toLocaleString() || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Budget limits */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Budget Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Daily Limit (USD)</label>
              <Input
                type="number"
                step="0.5"
                value={form.dailyLimit}
                onChange={(e) => setForm((f) => ({ ...f, dailyLimit: parseFloat(e.target.value) || 0 }))}
                className="bg-white/[0.06] border-white/[0.08] text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Monthly Limit (USD)</label>
              <Input
                type="number"
                step="1"
                value={form.monthlyLimit}
                onChange={(e) => setForm((f) => ({ ...f, monthlyLimit: parseFloat(e.target.value) || 0 }))}
                className="bg-white/[0.06] border-white/[0.08] text-white"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">When limit exceeded</label>
            <Select value={form.action} onValueChange={(val) => setForm((f) => ({ ...f, action: val as "warn" | "block" }))}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="warn">Warn only</SelectItem>
                <SelectItem value="block">Block requests</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={saveBudget} disabled={saving}>
            {saving ? "Saving..." : "Save Budget"}
          </Button>
        </CardContent>
      </Card>

      {/* Model Routing */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Model Routing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-zinc-500">Choose which model handles each task type. Budget pressure may auto-downgrade.</p>
          {TASK_TYPES.map((task) => (
            <div key={task}>
              <label className="text-sm text-zinc-400 mb-1 block">{TASK_LABELS[task]}</label>
              <Select value={routingForm[task] || ""} onValueChange={(val) => setRoutingForm((f) => ({ ...f, [task]: val }))}>
                <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <Button onClick={saveRouting} disabled={savingRouting}>
            {savingRouting ? "Saving..." : "Save Routing"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
