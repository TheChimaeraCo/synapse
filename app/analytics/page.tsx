"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { AppShell } from "@/components/layout/AppShell";
import { useState, useEffect } from "react";
import { Loader2, BarChart3, MessageSquare, Clock, Zap, Activity, DollarSign } from "lucide-react";
import { AnalyticsSkeleton } from "@/components/ui/Skeletons";
import { EmptyAnalyticsIllustration } from "@/components/ui/EmptyStates";

interface AnalyticsData {
  days: string[];
  messagesPerDay: number[];
  tokensPerDay: { input: number; output: number }[];
  sessionsPerDay: number[];
  toolUsage: [string, number][];
  latencyBuckets: { label: string; count: number }[];
  totalMessages: number;
  totalSessions: number;
  avgLatency: number;
  totalCost: number;
  costByModel: { model: string; input: number; output: number; cost: number; count: number }[];
  estimatedDailyCost: number;
  estimatedMonthlyCost: number;
}

function BarChart({ data, labels, color = "blue", height = 160 }: { data: number[]; labels: string[]; color?: string; height?: number }) {
  const max = Math.max(...data, 1);
  const barW = Math.max(4, Math.min(16, 600 / data.length - 2));
  const w = data.length * (barW + 2) + 40;
  const h = height;
  const padTop = 20;
  const padBot = 30;
  const chartH = h - padTop - padBot;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: h }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <g key={pct}>
          <line x1={30} y1={padTop + chartH * (1 - pct)} x2={w} y2={padTop + chartH * (1 - pct)} stroke="rgba(255,255,255,0.06)" />
          <text x={26} y={padTop + chartH * (1 - pct) + 4} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize={8}>
            {Math.round(max * pct)}
          </text>
        </g>
      ))}
      {/* Bars */}
      {data.map((val, i) => {
        const barH = (val / max) * chartH;
        const x = 34 + i * (barW + 2);
        const y = padTop + chartH - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={2}
              fill={color === "blue" ? "rgba(59,130,246,0.6)" : color === "purple" ? "rgba(168,85,247,0.6)" : "rgba(16,185,129,0.6)"}
            />
            {i % 5 === 0 && (
              <text x={x + barW / 2} y={h - 4} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={7}>
                {labels[i]?.slice(5) || ""}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function HorizontalBarChart({ items, color = "blue" }: { items: [string, number][]; color?: string }) {
  const max = Math.max(...items.map(([, v]) => v), 1);
  return (
    <div className="space-y-2">
      {items.map(([name, count]) => (
        <div key={name} className="flex items-center gap-3">
          <span className="text-xs text-zinc-400 w-28 truncate text-right">{name}</span>
          <div className="flex-1 h-5 bg-white/[0.04] rounded-lg overflow-hidden">
            <div className="h-full rounded-lg transition-all"
              style={{
                width: `${(count / max) * 100}%`,
                background: color === "blue" ? "linear-gradient(90deg, rgba(59,130,246,0.5), rgba(59,130,246,0.8))" : "linear-gradient(90deg, rgba(168,85,247,0.5), rgba(168,85,247,0.8))",
              }}
            />
          </div>
          <span className="text-xs text-zinc-300 w-12">{count}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4">
      <div className="flex items-center gap-2 text-zinc-400 mb-2">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await gatewayFetch("/api/analytics");
        if (res.ok) setData(await res.json());
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <AppShell title="Analytics">
        <AnalyticsSkeleton />
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell title="Analytics">
        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
          <EmptyAnalyticsIllustration />
          <p className="text-lg font-medium text-zinc-300 mb-1">No analytics data</p>
          <p className="text-sm text-zinc-500">Start conversations to see usage analytics here.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Analytics">
      <div className="p-4 lg:p-6 space-y-6 overflow-auto max-h-[calc(100vh-4rem)] animate-fade-in">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Messages" value={data.totalMessages.toLocaleString()} icon={MessageSquare} />
          <StatCard label="Total Sessions" value={data.totalSessions.toLocaleString()} icon={Activity} />
          <StatCard label="Avg Latency" value={data.avgLatency ? `${(data.avgLatency / 1000).toFixed(1)}s` : "N/A"} icon={Clock} />
          <StatCard label="Est. Monthly Cost" value={`$${data.estimatedMonthlyCost?.toFixed(2) || '0.00'}`} icon={DollarSign} />
        </div>

        {/* Messages per day */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4">
          <h3 className="text-sm font-medium text-zinc-200 mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-400" /> Messages per Day (30d)
          </h3>
          <BarChart data={data.messagesPerDay} labels={data.days} color="blue" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Token usage */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4">
            <h3 className="text-sm font-medium text-zinc-200 mb-3">Token Usage (30d)</h3>
            <BarChart data={data.tokensPerDay.map((t) => t.input + t.output)} labels={data.days} color="purple" height={140} />
          </div>

          {/* Sessions per day */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4">
            <h3 className="text-sm font-medium text-zinc-200 mb-3">Sessions per Day (30d)</h3>
            <BarChart data={data.sessionsPerDay} labels={data.days} color="green" height={140} />
          </div>
        </div>

        {/* Cost by model */}
        {data.costByModel && data.costByModel.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4">
            <h3 className="text-sm font-medium text-zinc-200 mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-amber-400" /> Cost Breakdown by Model
            </h3>
            <div className="space-y-3">
              {data.costByModel.map((m) => {
                const maxCost = Math.max(...data.costByModel.map(x => x.cost), 0.001);
                return (
                  <div key={m.model} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300 font-mono">{m.model}</span>
                      <span className="text-zinc-400">${m.cost.toFixed(4)} ({m.count} calls)</span>
                    </div>
                    <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500/60 to-amber-400/80"
                        style={{ width: `${(m.cost / maxCost) * 100}%` }}
                      />
                    </div>
                    <div className="flex gap-4 text-[10px] text-zinc-500">
                      <span>Input: {(m.input / 1000).toFixed(1)}k tokens</span>
                      <span>Output: {(m.output / 1000).toFixed(1)}k tokens</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-white/[0.06] flex justify-between text-xs">
              <span className="text-zinc-400">Total (30d)</span>
              <span className="text-amber-300 font-semibold">${data.totalCost?.toFixed(4) || '0.00'}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Tool usage */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4">
            <h3 className="text-sm font-medium text-zinc-200 mb-3">Top Tools</h3>
            {data.toolUsage.length > 0 ? (
              <HorizontalBarChart items={data.toolUsage} color="blue" />
            ) : (
              <p className="text-xs text-zinc-500">No tool usage data yet</p>
            )}
          </div>

          {/* Latency distribution */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4">
            <h3 className="text-sm font-medium text-zinc-200 mb-3">Response Time Distribution</h3>
            <HorizontalBarChart items={data.latencyBuckets.map((b) => [b.label, b.count])} color="purple" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
