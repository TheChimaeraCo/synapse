"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useEffect, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, RefreshCw, ChevronDown, Clock, User, Activity } from "lucide-react";

type UserRecord = {
  _id: string;
  email: string;
  name?: string;
  role: string;
};

type AuditEntry = {
  _id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: string;
  timestamp: number;
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-600/20 text-purple-400 border-purple-500/30",
  admin: "bg-blue-600/20 text-blue-400 border-blue-500/30",
  user: "bg-green-600/20 text-green-400 border-green-500/30",
  viewer: "bg-white/[0.10]/20 text-zinc-400 border-white/[0.08]",
};

const ROLES = ["owner", "admin", "user", "viewer"] as const;

export function SecurityTab() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, auditRes] = await Promise.all([
        gatewayFetch("/api/users"),
        gatewayFetch("/api/audit?limit=20"),
      ]);
      if (usersRes.ok) setUsers(await usersRes.json());
      if (auditRes.ok) setAuditLogs(await auditRes.json());
    } catch (e) {
      console.error("Failed to fetch security data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleRoleChange(userId: string, newRole: string) {
    setChangingRole(userId);
    try {
      const res = await gatewayFetch("/api/users/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId, role: newRole }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u._id === userId ? { ...u, role: newRole } : u))
        );
      }
    } catch (e) {
      console.error("Failed to change role:", e);
    } finally {
      setChangingRole(null);
    }
  }

  function formatTime(ts: number) {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading security settings...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Users & Roles */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <User className="w-5 h-5" />
          Users & Roles
        </h3>
        <p className="text-sm text-zinc-500 mb-4">
          Manage user access levels. Owners have full control, viewers are read-only.
        </p>
        <div className="border border-white/[0.06] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.04]/50">
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">User</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Role</th>
                <th className="text-right px-4 py-3 text-zinc-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id} className="border-b border-white/[0.06]/50 hover:bg-white/[0.06]/30">
                  <td className="px-4 py-3 text-white">{user.name || "Unnamed"}</td>
                  <td className="px-4 py-3 text-zinc-400">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[user.role] || ROLE_COLORS.user}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Select value={user.role} onValueChange={(val) => handleRoleChange(user._id, val)} disabled={changingRole === user._id}>
                      <SelectTrigger className="h-8 w-28 bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Log */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Recent Audit Log
        </h3>
        <p className="text-sm text-zinc-500 mb-4">
          Last 20 security-relevant actions.
        </p>
        <div className="border border-white/[0.06] rounded-lg overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            {auditLogs.length === 0 ? (
              <div className="px-4 py-8 text-center text-zinc-500">No audit entries yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-b border-white/[0.06] bg-white/[0.04]/50">
                    <th className="text-left px-4 py-2 text-zinc-400 font-medium">Time</th>
                    <th className="text-left px-4 py-2 text-zinc-400 font-medium">Action</th>
                    <th className="text-left px-4 py-2 text-zinc-400 font-medium">Resource</th>
                    <th className="text-left px-4 py-2 text-zinc-400 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log._id} className="border-b border-white/[0.06]/50">
                      <td className="px-4 py-2 text-zinc-500 whitespace-nowrap">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {formatTime(log.timestamp)}
                      </td>
                      <td className="px-4 py-2 text-white font-mono text-xs">{log.action}</td>
                      <td className="px-4 py-2 text-zinc-400">{log.resource}</td>
                      <td className="px-4 py-2 text-zinc-500 truncate max-w-xs">{log.details || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Encryption */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Secrets Encryption
        </h3>
        <p className="text-sm text-zinc-500 mb-4">
          API keys and sensitive config values are encrypted at rest with AES-256-GCM.
        </p>
        <div className="border border-white/[0.06] rounded-lg p-4 bg-white/[0.04]/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Encryption Status</p>
              <p className="text-xs text-green-400 mt-1">Active - AES-256-GCM</p>
            </div>
            <button
              disabled
              className="px-3 py-1.5 text-xs rounded-md border border-white/[0.08] text-zinc-500 cursor-not-allowed"
              title="Coming soon"
            >
              Rotate Key (coming soon)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
