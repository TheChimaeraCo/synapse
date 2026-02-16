"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Globe, CheckCircle2, XCircle, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";

const EVENTS = ["message.created", "session.created", "tool.executed", "agent.error"] as const;

interface Webhook {
  _id: string;
  url: string;
  events: string[];
  secret: string;
  enabled: boolean;
  description?: string;
  lastTriggeredAt?: number;
  lastStatus?: number;
}

export function WebhooksTab() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["message.created"]);
  const { data: session } = useSession();
  const gatewayId = (session?.user as any)?.gatewayId;

  const fetchWebhooks = async () => {
    if (!gatewayId) return;
    try {
      const res = await gatewayFetch(`/api/webhooks?gatewayId=${gatewayId}`);
      if (res.ok) setWebhooks(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchWebhooks(); }, [gatewayId]);

  const generateSecret = () => {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  };

  const handleAdd = async () => {
    if (!newUrl.trim()) return toast.error("URL is required");
    if (!newEvents.length) return toast.error("Select at least one event");
    setAdding(true);
    try {
      const res = await gatewayFetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gatewayId, url: newUrl.trim(), events: newEvents,
          secret: generateSecret(), enabled: true, description: newDesc.trim() || undefined,
        }),
      });
      if (res.ok) {
        toast.success("Webhook created");
        setNewUrl(""); setNewDesc(""); setNewEvents(["message.created"]);
        fetchWebhooks();
      }
    } catch { toast.error("Failed to create webhook"); }
    setAdding(false);
  };

  const toggleEnabled = async (wh: Webhook) => {
    await gatewayFetch("/api/webhooks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: wh._id, enabled: !wh.enabled }),
    });
    fetchWebhooks();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this webhook?")) return;
    await gatewayFetch("/api/webhooks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    toast.success("Webhook deleted");
    fetchWebhooks();
  };

  const toggleEvent = (event: string) => {
    setNewEvents((prev) => prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]);
  };

  if (loading) return <div className="flex items-center gap-2 text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Outbound Webhooks</h2>
        <p className="text-sm text-zinc-400 mt-1">Fire HTTP callbacks when events occur. Payloads are signed with HMAC-SHA256.</p>
      </div>

      {/* Add new */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 space-y-3">
        <h3 className="text-sm font-medium text-zinc-200">New Webhook</h3>
        <Input placeholder="https://example.com/webhook" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className="bg-white/[0.07] border-white/10 rounded-xl" />
        <Input placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="bg-white/[0.07] border-white/10 rounded-xl" />
        <div className="flex flex-wrap gap-2">
          {EVENTS.map((ev) => (
            <button key={ev} onClick={() => toggleEvent(ev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${newEvents.includes(ev) ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-white/[0.04] text-zinc-400 border border-white/10 hover:bg-white/[0.07]"}`}>
              {ev}
            </button>
          ))}
        </div>
        <Button onClick={handleAdd} disabled={adding} className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl">
          {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />} Add Webhook
        </Button>
      </div>

      {/* List */}
      {webhooks.length === 0 ? (
        <div className="text-center text-zinc-500 py-8">No webhooks configured</div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <div key={wh._id} className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-zinc-400 shrink-0" />
                    <span className="text-sm font-mono text-zinc-200 truncate">{wh.url}</span>
                    <button onClick={() => { navigator.clipboard.writeText(wh.secret); toast.success("Secret copied"); }}
                      className="text-zinc-500 hover:text-zinc-300"><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                  {wh.description && <p className="text-xs text-zinc-500 mt-1">{wh.description}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {wh.events.map((ev) => (
                      <span key={ev} className="px-2 py-0.5 rounded-md bg-white/[0.07] text-xs text-zinc-400">{ev}</span>
                    ))}
                  </div>
                  {wh.lastTriggeredAt && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-zinc-500">
                      {wh.lastStatus && wh.lastStatus >= 200 && wh.lastStatus < 300 ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
                      Last fired: {new Date(wh.lastTriggeredAt).toLocaleString()} (HTTP {wh.lastStatus})
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleEnabled(wh)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${wh.enabled ? "bg-blue-500" : "bg-zinc-700"}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${wh.enabled ? "left-5" : "left-0.5"}`} />
                  </button>
                  <button onClick={() => handleDelete(wh._id)} className="text-zinc-500 hover:text-red-400 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
