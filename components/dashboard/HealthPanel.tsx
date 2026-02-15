"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useEffect } from "react";
import { Activity, Shield, AlertTriangle, CheckCircle, XCircle, RefreshCw } from "lucide-react";

interface HealthCheck {
  _id: string;
  component: string;
  status: "healthy" | "degraded" | "down";
  lastCheck: number;
  lastHealthy: number;
  message: string;
}

interface CircuitBreaker {
  _id: string;
  name: string;
  state: "closed" | "open" | "half-open";
  failures: number;
  threshold: number;
}

const STATUS_CONFIG = {
  healthy: { icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
  degraded: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
  down: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
};

const BREAKER_CONFIG = {
  closed: { color: "text-green-400", bg: "bg-green-500/10" },
  "half-open": { color: "text-yellow-400", bg: "bg-yellow-500/10" },
  open: { color: "text-red-400", bg: "bg-red-500/10" },
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  return `${Math.round(diff / 3600000)}h ago`;
}

export function HealthPanel() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [breakers, setBreakers] = useState<CircuitBreaker[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    try {
      const res = await gatewayFetch("/api/health");
      const data = await res.json();
      setChecks(data.healthChecks || []);
      setBreakers(data.circuitBreakers || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHealth(); const i = setInterval(fetchHealth, 30000); return () => clearInterval(i); }, []);

  return (
    <div className="border border-white/[0.08]/50 rounded-lg bg-white/[0.04]/50 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <h3 className="font-medium text-white">System Health</h3>
        </div>
        <button onClick={fetchHealth} className="p-1 rounded hover:bg-white/[0.06] text-zinc-400 hover:text-white">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {checks.length === 0 && !loading && (
        <p className="text-sm text-zinc-500">No health data yet. Run a health check to see status.</p>
      )}

      <div className="space-y-2">
        {checks.map((check) => {
          const cfg = STATUS_CONFIG[check.status];
          const Icon = cfg.icon;
          return (
            <div key={check._id} className={`flex items-center justify-between p-2.5 rounded-md border ${cfg.bg} ${cfg.border}`}>
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${cfg.color}`} />
                <span className="text-sm font-medium text-white">{check.component}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500">{timeAgo(check.lastCheck)}</span>
                <span className={`text-xs font-medium ${cfg.color}`}>{check.status}</span>
              </div>
            </div>
          );
        })}
      </div>

      {breakers.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/[0.08]/50">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Circuit Breakers</span>
          </div>
          <div className="space-y-1.5">
            {breakers.map((b) => {
              const cfg = BREAKER_CONFIG[b.state];
              return (
                <div key={b._id} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-white/[0.04]">
                  <span className="text-sm text-zinc-300">{b.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{b.failures}/{b.threshold}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{b.state}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
