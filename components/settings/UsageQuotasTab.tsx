"use client";

import { useState, useEffect } from "react";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { useSession } from "next-auth/react";
import { BarChart3, MessageSquare, Users, HardDrive, Zap } from "lucide-react";

interface UsageData {
  messagesDay: number;
  messagesMonth: number;
  sessionsCreated: number;
  apiCalls: number;
}

interface TierLimits {
  messagesPerDay: number;
  messagesPerMonth: number;
  maxSessions: number;
  maxApiCalls: number;
}

const DEFAULT_LIMITS: TierLimits = {
  messagesPerDay: 1000,
  messagesPerMonth: 30000,
  maxSessions: 100,
  maxApiCalls: 50000,
};

function progressColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-yellow-500";
  return "bg-green-500";
}

function progressBorderColor(pct: number): string {
  if (pct >= 90) return "border-red-500/30";
  if (pct >= 70) return "border-yellow-500/30";
  return "border-green-500/30";
}

function QuotaBar({
  label,
  icon: Icon,
  current,
  limit,
  unit,
}: {
  label: string;
  icon: typeof BarChart3;
  current: number;
  limit: number;
  unit?: string;
}) {
  const pct = limit > 0 ? Math.min(100, (current / limit) * 100) : 0;

  return (
    <div className={`rounded-xl bg-white/[0.04] border ${progressBorderColor(pct)} p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">{label}</span>
        </div>
        <span className="text-xs text-zinc-400">
          {current.toLocaleString()} / {limit.toLocaleString()} {unit || ""}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${progressColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-right text-xs text-zinc-500">{pct.toFixed(1)}% used</div>
    </div>
  );
}

export function UsageQuotasTab() {
  const { data: session } = useSession();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [limits, setLimits] = useState<TierLimits>(DEFAULT_LIMITS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Fetch usage stats from analytics endpoint
        const res = await gatewayFetch("/api/analytics/usage");
        if (res.ok) {
          const data = await res.json();
          setUsage({
            messagesDay: data.messagesDay ?? 0,
            messagesMonth: data.messagesMonth ?? 0,
            sessionsCreated: data.sessionsCreated ?? 0,
            apiCalls: data.apiCalls ?? 0,
          });
          if (data.limits) {
            setLimits({ ...DEFAULT_LIMITS, ...data.limits });
          }
        }
      } catch (e) {
        console.error("Failed to load usage data:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        Loading usage data...
      </div>
    );
  }

  const u = usage || { messagesDay: 0, messagesMonth: 0, sessionsCreated: 0, apiCalls: 0 };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-400" />
          Usage Quotas
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Your current usage relative to your tier limits
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <QuotaBar
          label="Messages Today"
          icon={MessageSquare}
          current={u.messagesDay}
          limit={limits.messagesPerDay}
        />
        <QuotaBar
          label="Messages This Month"
          icon={MessageSquare}
          current={u.messagesMonth}
          limit={limits.messagesPerMonth}
        />
        <QuotaBar
          label="Active Sessions"
          icon={Users}
          current={u.sessionsCreated}
          limit={limits.maxSessions}
        />
        <QuotaBar
          label="API Calls"
          icon={Zap}
          current={u.apiCalls}
          limit={limits.maxApiCalls}
        />
      </div>

      <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-2">Color Guide</h3>
        <div className="flex flex-wrap gap-4 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-green-500" /> Under 70%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-yellow-500" /> 70-90%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500" /> Over 90%
          </span>
        </div>
      </div>
    </div>
  );
}
