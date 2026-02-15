"use client";

import { useState, useEffect, useCallback } from "react";
import { useGateway } from "@/contexts/GatewayContext";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Link2, Loader2, Plus, Trash2, UserPlus, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Member {
  _id: string;
  userId: string;
  username?: string;
  email?: string;
  role: string;
  addedAt: number;
}

interface Invite {
  _id: string;
  code: string;
  role: string;
  createdAt: number;
  expiresAt?: number;
  usedBy?: string;
  maxUses?: number;
  useCount?: number;
}

const ROLES = ["owner", "admin", "member", "viewer"] as const;
const ROLE_COLORS: Record<string, string> = {
  owner: "text-amber-400 border-amber-500/30",
  admin: "text-blue-400 border-blue-500/30",
  member: "text-zinc-300 border-white/[0.08]",
  viewer: "text-zinc-500 border-white/[0.10]/30",
};

export function MembersTab() {
  const { activeGateway, activeRole } = useGateway();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [creating, setCreating] = useState(false);

  const canManage = activeRole === "owner" || activeRole === "admin";

  const fetchMembers = useCallback(async () => {
    if (!activeGateway) return;
    try {
      const [membersRes, invitesRes] = await Promise.all([
        gatewayFetch(`/api/gateways/${activeGateway._id}/members`),
        canManage ? gatewayFetch(`/api/gateways/${activeGateway._id}/invites`) : Promise.resolve(null),
      ]);
      if (membersRes.ok) {
        const data = await membersRes.json();
        setMembers(data.members || []);
      }
      if (invitesRes?.ok) {
        const data = await invitesRes.json();
        setInvites(data.invites || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [activeGateway, canManage]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const createInvite = async () => {
    if (!activeGateway) return;
    setCreating(true);
    try {
      const res = await gatewayFetch(`/api/gateways/${activeGateway._id}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: inviteRole }),
      });
      if (res.ok) {
        const data = await res.json();
        const link = `${window.location.origin}/invite/${data.code}`;
        await navigator.clipboard.writeText(link);
        toast.success("Invite link copied to clipboard");
        setShowInviteForm(false);
        fetchMembers();
      } else {
        toast.error("Failed to create invite");
      }
    } catch {
      toast.error("Failed to create invite");
    } finally {
      setCreating(false);
    }
  };

  const changeRole = async (memberId: string, newRole: string) => {
    if (!activeGateway) return;
    try {
      const res = await gatewayFetch(`/api/gateways/${activeGateway._id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        toast.success("Role updated");
        fetchMembers();
      } else {
        toast.error("Failed to update role");
      }
    } catch {
      toast.error("Failed to update role");
    }
  };

  const removeMember = async (memberId: string, username?: string) => {
    if (!activeGateway) return;
    if (!confirm(`Remove ${username || "this member"} from the gateway?`)) return;
    try {
      const res = await gatewayFetch(`/api/gateways/${activeGateway._id}/members/${memberId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Member removed");
        fetchMembers();
      }
    } catch {
      toast.error("Failed to remove member");
    }
  };

  const revokeInvite = async (inviteId: string) => {
    if (!activeGateway) return;
    try {
      const res = await gatewayFetch(`/api/gateways/${activeGateway._id}/invites/${inviteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Invite revoked");
        fetchMembers();
      }
    } catch {
      toast.error("Failed to revoke invite");
    }
  };

  if (!activeGateway) {
    return <div className="text-zinc-500 p-4">No gateway selected.</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading members...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-200 mb-1">Members</h2>
          <p className="text-sm text-zinc-400">
            Manage members of <span className="text-zinc-200 font-medium">{activeGateway.name}</span>
            <span className="ml-2 text-zinc-500">({members.length} members)</span>
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowInviteForm(true)} size="sm">
            <UserPlus className="h-4 w-4 mr-1" /> Invite
          </Button>
        )}
      </div>

      {/* Invite form */}
      {showInviteForm && (
        <div className="bg-white/[0.07] backdrop-blur-xl border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-200">Create Invite Link</h3>
            <button onClick={() => setShowInviteForm(false)} className="text-zinc-500 hover:text-zinc-300">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Role</label>
              <Select value={inviteRole} onValueChange={(val) => setInviteRole(val)}>
                <SelectTrigger className="w-36 bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  {activeRole === "owner" && <SelectItem value="admin">Admin</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={createInvite} disabled={creating} className="mt-5" size="sm">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4 mr-1" />}
              Generate & Copy Link
            </Button>
          </div>
        </div>
      )}

      {/* Capacity indicator */}
      {members.length >= 4 && members.length <= 5 && (
        <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 text-sm text-blue-300">
          <span className="font-medium">{members.length}/5 members used.</span>
          {members.length === 5 && " Upgrade to Team plan for up to 15 members."}
        </div>
      )}

      {/* Members list */}
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m._id} className="flex items-center gap-3 px-4 py-3 bg-white/[0.04] rounded-xl border border-white/10">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white/[0.07] text-sm font-semibold text-zinc-300 shrink-0">
              {(m.username || m.email || "?").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-200 truncate">{m.username || m.email || m.userId}</div>
              <div className="text-[10px] text-zinc-500">Joined {new Date(m.addedAt).toLocaleDateString()}</div>
            </div>
            {canManage && m.role !== "owner" ? (
              <Select value={m.role} onValueChange={(val) => changeRole(m._id, val)}>
                <SelectTrigger className={cn("h-8 w-28 bg-white/[0.04] border-white/[0.08] rounded-xl text-xs capitalize", ROLE_COLORS[m.role])}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter((r) => r !== "owner").map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className={cn("capitalize", ROLE_COLORS[m.role])}>
                {m.role}
              </Badge>
            )}
            {canManage && m.role !== "owner" && (
              <button
                onClick={() => removeMember(m._id, m.username)}
                className="text-zinc-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {members.length === 0 && (
          <div className="text-center py-8 text-zinc-500">
            <Users className="mx-auto h-8 w-8 mb-2" />
            No members found.
          </div>
        )}
      </div>

      {/* Active invites */}
      {canManage && invites.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-300 mb-2">Active Invites</h3>
          <div className="space-y-2">
            {invites.map((inv) => (
              <div key={inv._id} className="flex items-center gap-3 px-4 py-2 bg-white/[0.04] rounded-xl border border-white/10 text-xs">
                <code className="text-zinc-400 font-mono flex-1 truncate">{inv.code}</code>
                <Badge variant="outline" className={cn("capitalize", ROLE_COLORS[inv.role])}>
                  {inv.role}
                </Badge>
                {inv.useCount !== undefined && (
                  <span className="text-zinc-500">{inv.useCount}{inv.maxUses ? `/${inv.maxUses}` : ""} uses</span>
                )}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.code}`);
                    toast.success("Copied");
                  }}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => revokeInvite(inv._id)}
                  className="text-zinc-500 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
