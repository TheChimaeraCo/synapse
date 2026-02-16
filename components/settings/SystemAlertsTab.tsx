"use client";

import { useState, useEffect } from "react";
import { gatewayFetch } from "@/lib/gatewayFetch";
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  XCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

interface SystemAlert {
  _id: string;
  level: "info" | "warning" | "error" | "critical";
  message: string;
  source: string;
  acknowledged: boolean;
  timestamp: number;
}

const LEVEL_CONFIG = {
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  warning: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
  error: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  critical: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/20", border: "border-red-500/30" },
};

export function SystemAlertsTab() {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const params = showAcknowledged ? "" : "?unacknowledged=true";
      const res = await gatewayFetch(`/api/alerts${params}`);
      if (res.ok) {
        setAlerts(await res.json());
      }
    } catch (e) {
      console.error("Failed to fetch alerts:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [showAcknowledged]);

  const acknowledgeAlert = async (id: string) => {
    try {
      await gatewayFetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge", id }),
      });
      setAlerts((prev) => prev.filter((a) => a._id !== id));
    } catch (e) {
      console.error("Failed to acknowledge alert:", e);
    }
  };

  const acknowledgeAll = async () => {
    try {
      await gatewayFetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge" }),
      });
      setAlerts([]);
    } catch (e) {
      console.error("Failed to acknowledge all:", e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-400" />
            System Alerts
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Monitor system health and important notifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAcknowledged(!showAcknowledged)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
              showAcknowledged
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                : "bg-white/[0.04] text-zinc-400 border border-white/10"
            }`}
          >
            {showAcknowledged ? "Showing All" : "Active Only"}
          </button>
          {alerts.length > 0 && !showAcknowledged && (
            <button
              onClick={acknowledgeAll}
              className="px-3 py-1.5 rounded-lg text-xs bg-white/[0.04] border border-white/10 text-zinc-400 hover:text-white transition-colors"
            >
              Dismiss All
            </button>
          )}
          <button
            onClick={fetchAlerts}
            className="p-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading && !alerts.length ? (
        <div className="text-center py-12 text-zinc-500">Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl p-12 text-center">
          <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-3" />
          <p className="text-zinc-300 font-medium">All clear</p>
          <p className="text-sm text-zinc-500 mt-1">No active alerts</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => {
            const config = LEVEL_CONFIG[alert.level];
            const Icon = config.icon;
            return (
              <div
                key={alert._id}
                className={`rounded-xl ${config.bg} border ${config.border} p-4 flex items-start gap-3 backdrop-blur-xl`}
              >
                <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200">{alert.message}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                    <span>{alert.source}</span>
                    <span>{new Date(alert.timestamp).toLocaleString()}</span>
                  </div>
                </div>
                {!alert.acknowledged && (
                  <button
                    onClick={() => acknowledgeAlert(alert._id)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded-lg hover:bg-white/[0.07] transition-colors flex-shrink-0"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
