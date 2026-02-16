"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { gatewayFetch } from "@/lib/gatewayFetch";
import {
  Search,
  Filter,
  Shield,
  User,
  Settings,
  Bot,
  MessageSquare,
  Users,
  Wrench,
  RefreshCw,
} from "lucide-react";

interface AuditEntry {
  _id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: string;
  ip?: string;
  timestamp: number;
}

const ACTION_ICONS: Record<string, typeof Shield> = {
  user: User,
  config: Settings,
  agent: Bot,
  channel: MessageSquare,
  member: Users,
  tool: Wrench,
};

const ACTION_COLORS: Record<string, string> = {
  create: "text-green-400",
  update: "text-blue-400",
  delete: "text-red-400",
  login: "text-purple-400",
  enable: "text-green-400",
  disable: "text-yellow-400",
  add: "text-green-400",
  remove: "text-red-400",
  change: "text-yellow-400",
  role_change: "text-yellow-400",
};

function getActionColor(action: string) {
  const parts = action.split(".");
  const verb = parts[parts.length - 1];
  return ACTION_COLORS[verb] || "text-zinc-400";
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [limit, setLimit] = useState(100);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (filterAction) params.set("action", filterAction);
      const res = await gatewayFetch(`/api/audit?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error("Failed to fetch audit logs:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterAction, limit]);

  const filtered = logs.filter((log) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.resource.toLowerCase().includes(q) ||
      (log.details || "").toLowerCase().includes(q) ||
      (log.resourceId || "").toLowerCase().includes(q)
    );
  });

  const actionTypes = [...new Set(logs.map((l) => l.action))].sort();

  return (
    <AppShell title="Audit Log">
      <div className="p-4 lg:p-6 space-y-4 overflow-auto h-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-400" />
              Audit Log
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Track admin actions and changes across your gateway
            </p>
          </div>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.07] border border-white/10 text-sm text-zinc-300 hover:bg-white/[0.12] transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 backdrop-blur-xl"
            />
          </div>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-300 focus:outline-none focus:border-blue-500/50 backdrop-blur-xl"
          >
            <option value="">All Actions</option>
            {actionTypes.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {/* Log Table */}
        <div className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="px-4 py-3 text-zinc-400 font-medium">Time</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Action</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Resource</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">Details</th>
                </tr>
              </thead>
              <tbody>
                {loading && !logs.length ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-zinc-500">
                      Loading...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-zinc-500">
                      No audit log entries found
                    </td>
                  </tr>
                ) : (
                  filtered.map((log) => {
                    const Icon = ACTION_ICONS[log.resource] || Shield;
                    return (
                      <tr
                        key={log._id}
                        className="border-b border-white/5 hover:bg-white/[0.04] transition-colors"
                      >
                        <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-mono text-xs ${getActionColor(log.action)}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 text-zinc-500" />
                            <span className="text-zinc-300">{log.resource}</span>
                            {log.resourceId && (
                              <span className="text-xs text-zinc-600 font-mono truncate max-w-[120px]">
                                {log.resourceId}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-500 hidden md:table-cell max-w-xs truncate">
                          {log.details || "-"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-xs text-zinc-600 text-center">
          Showing {filtered.length} of {logs.length} entries
        </div>
      </div>
    </AppShell>
  );
}
