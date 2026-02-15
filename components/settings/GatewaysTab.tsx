"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit2, Server, Check, X } from "lucide-react";

interface Gateway {
  _id: string;
  name: string;
  slug: string;
  status: "active" | "paused";
  createdAt: number;
  stats?: { agentCount: number; messageCount: number };
}

export function GatewaysTab() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchGateways = useCallback(async () => {
    try {
      const res = await gatewayFetch("/api/gateways");
      if (res.ok) {
        const data = await res.json();
        setGateways(data.gateways || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGateways(); }, [fetchGateways]);

  const handleCreate = async () => {
    if (!newName.trim() || !newSlug.trim()) return;
    setError(null);
    try {
      const res = await gatewayFetch("/api/gateways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), slug: newSlug.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create");
        return;
      }
      setNewName("");
      setNewSlug("");
      setCreating(false);
      fetchGateways();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await gatewayFetch(`/api/gateways/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName }),
      });
      setEditId(null);
      fetchGateways();
    } catch {}
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this gateway and all its data? This cannot be undone.")) return;
    try {
      await gatewayFetch(`/api/gateways/${id}`, { method: "DELETE" });
      fetchGateways();
    } catch {}
  };

  const handleToggle = async (id: string, current: string) => {
    try {
      await gatewayFetch(`/api/gateways/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: current === "active" ? "paused" : "active" }),
      });
      fetchGateways();
    } catch {}
  };

  if (loading) return <div className="text-zinc-400">Loading...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white mb-1">Gateways</h2>
          <p className="text-sm text-zinc-400">Manage gateway instances. Each gateway has its own agents, sessions, and data.</p>
        </div>
        <Button
          onClick={() => setCreating(true)}
         
          size="sm"
        >
          <Plus className="h-4 w-4 mr-1" /> New Gateway
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {creating && (
        <Card className="bg-white/[0.07] backdrop-blur-xl border-white/10">
          <CardHeader>
            <CardTitle className="text-sm text-zinc-300">Create New Gateway</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Name</label>
              <Input
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (!newSlug || newSlug === newName.toLowerCase().replace(/[^a-z0-9]+/g, "-")) {
                    setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                  }
                }}
                placeholder="My Gateway"
                className="bg-white/[0.07] border-white/10 text-zinc-200"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Slug</label>
              <Input
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ""))}
                placeholder="my-gateway"
                className="bg-white/[0.07] border-white/10 text-zinc-200"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} size="sm">
                Create
              </Button>
              <Button onClick={() => { setCreating(false); setError(null); }} size="sm" variant="ghost">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {gateways.map((gw) => (
          <Card key={gw._id} className="bg-white/[0.07] backdrop-blur-xl border-white/10">
            <CardContent className="flex items-center gap-4 py-4">
              <Server className="h-8 w-8 text-zinc-500 shrink-0" />
              <div className="flex-1 min-w-0">
                {editId === gw._id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="bg-white/[0.07] border-white/10 text-zinc-200 h-8 text-sm"
                      autoFocus
                    />
                    <button onClick={() => handleUpdate(gw._id)} className="text-green-400 hover:text-green-300">
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditId(null)} className="text-zinc-500 hover:text-zinc-300">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{gw.name}</span>
                      <Badge
                        variant="outline"
                        className={gw.status === "active" ? "text-green-400 border-green-500/30" : "text-zinc-500 border-white/[0.10]"}
                      >
                        {gw.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5 font-mono">{gw.slug}</div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setEditId(gw._id); setEditName(gw.name); }}
                  className="h-8 w-8 p-0 text-zinc-500 hover:text-white"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleToggle(gw._id, gw.status)}
                  className="h-8 px-2 text-xs text-zinc-500 hover:text-white"
                >
                  {gw.status === "active" ? "Pause" : "Resume"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(gw._id)}
                  className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {gateways.length === 0 && !creating && (
          <div className="text-center py-8 text-zinc-500">No gateways found. Create one to get started.</div>
        )}
      </div>
    </div>
  );
}
