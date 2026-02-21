"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGateway, Gateway } from "@/contexts/GatewayContext";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Crown, Loader2, Plus, Server, Users, MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { toast } from "sonner";

const ROLE_COLORS: Record<string, string> = {
  owner: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  admin: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  member: "text-zinc-400 border-white/[0.08] bg-white/[0.06]",
  viewer: "text-zinc-500 border-white/[0.10]/30 bg-white/[0.06]",
};

function CreateGatewayForm({ onCreated, onCancel }: { onCreated: (gatewayId: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, "-")) {
      const newSlug = val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      setSlug(newSlug);
      setWorkspacePath(`/root/synapse/gateways/${newSlug}/`);
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !slug.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await gatewayFetch("/api/gateways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || undefined,
          icon: icon.trim() || undefined,
          workspacePath: workspacePath.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create gateway");
        return;
      }
      toast.success(`Gateway "${name}" created!`);
      onCreated(data.gatewayId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-white/[0.07] backdrop-blur-xl border border-white/10 rounded-xl p-6 max-w-md w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-zinc-200">Create Gateway</h3>
        <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300">
          <X className="h-5 w-5" />
        </button>
      </div>
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-sm text-red-400">{error}</div>
      )}
      <div className="space-y-4">
        <div>
          <label className="text-sm text-zinc-400 mb-1 block">Name *</label>
          <input value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="My Gateway"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50" autoFocus />
        </div>
        <div>
          <label className="text-sm text-zinc-400 mb-1 block">Slug</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ""))} placeholder="my-gateway"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 font-mono" />
        </div>
        <div>
          <label className="text-sm text-zinc-400 mb-1 block">Icon (emoji)</label>
          <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🤖"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50" />
        </div>
        <div>
          <label className="text-sm text-zinc-400 mb-1 block">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description..." rows={2}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 resize-none" />
        </div>
        <div>
          <label className="text-sm text-zinc-400 mb-1 block">Workspace Path</label>
          <input value={workspacePath} onChange={(e) => setWorkspacePath(e.target.value)} placeholder="/root/synapse/gateways/slug/"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 font-mono text-xs" />
          <p className="text-zinc-600 text-xs mt-1">Directory for this gateway's workspace files.</p>
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={handleCreate} disabled={!name.trim() || creating} className="flex-1">
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            Create
          </Button>
          <Button onClick={onCancel} variant="ghost" className="text-zinc-400">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

export default function GatewaysPage() {
  const { gateways, activeGateway, loading, switchGateway, refreshGateways } = useGateway();
  const [showCreate, setShowCreate] = useState(false);
  const router = useRouter();

  // Auto-select if user has exactly 1 gateway
  useEffect(() => {
    if (!loading && gateways.length === 1 && !activeGateway) {
      switchGateway(gateways[0]._id).then(() => router.push("/chat"));
    }
  }, [loading, gateways, activeGateway, switchGateway, router]);

  const handleSelect = useCallback(async (gw: Gateway) => {
    await switchGateway(gw._id);
    router.push("/chat");
  }, [switchGateway, router]);

  const handleCreated = useCallback(async (gatewayId: string) => {
    await refreshGateways();
    setShowCreate(false);
    await switchGateway(gatewayId);
    router.push("/chat");
  }, [refreshGateways, switchGateway, router]);

  if (loading) {
    return (
      <AppShell title="Gateways">
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Gateways">
      <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-auto h-full">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">Your Gateways</h1>
            <p className="text-sm text-zinc-400 mt-1">Select a gateway to work with, or create a new one.</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Gateway
          </Button>
        </div>

        {showCreate && (
          <div className="flex justify-center">
            <CreateGatewayForm onCreated={handleCreated} onCancel={() => setShowCreate(false)} />
          </div>
        )}

        {gateways.length === 0 && !showCreate ? (
          <div className="text-center py-16">
            <Server className="mx-auto h-16 w-16 text-zinc-600 mb-4" />
            <h2 className="text-lg font-semibold text-zinc-300 mb-2">No gateways yet</h2>
            <p className="text-zinc-500 mb-6">Create your first gateway to get started with Synapse.</p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create Gateway
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {gateways.map((gw) => (
              <button key={gw._id} onClick={() => handleSelect(gw)}
                className={cn(
                  "text-left bg-white/[0.04] backdrop-blur-2xl border rounded-2xl p-5 transition-all duration-200 hover:bg-white/[0.07] hover:border-white/[0.15] hover:shadow-[0_12px_40px_rgba(0,0,0,0.3)] hover:scale-[1.02]",
                  gw._id === activeGateway?._id
                    ? "border-blue-500/20 ring-1 ring-blue-500/15 shadow-[0_0_20px_rgba(59,130,246,0.1)]"
                    : "border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
                )}>
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center h-11 w-11 rounded-xl bg-white/[0.06] border border-white/[0.08] text-lg font-semibold text-zinc-200 shrink-0">
                    {gw.icon || gw.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-zinc-200 truncate">{gw.name}</span>
                      {gw.isMaster && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px]">
                          <Crown className="h-2.5 w-2.5" /> Master
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-zinc-500 font-mono">{gw.slug}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
                  {gw.role && (
                    <span className={cn("px-1.5 py-0.5 rounded-full border capitalize", ROLE_COLORS[gw.role] || ROLE_COLORS.member)}>
                      {gw.role}
                    </span>
                  )}
                  {gw.memberCount !== undefined && (
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {gw.memberCount}</span>
                  )}
                  {gw.messageCount !== undefined && (
                    <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {gw.messageCount}</span>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", gw.status === "active" ? "bg-green-500" : "bg-white/[0.12]")} />
                  <span className="text-[10px] text-zinc-500 capitalize">{gw.status}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
