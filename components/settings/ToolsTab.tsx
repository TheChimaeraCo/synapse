"use client";
import { HelpTooltip } from "@/components/HelpTooltip";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { parseProviderProfiles } from "@/lib/aiRoutingConfig";
import { useFetch } from "@/lib/hooks";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface ToolRecord {
  _id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  requiresApproval: boolean;
  providerProfileId?: string;
  provider?: string;
  model?: string;
}

interface ApprovalRecord {
  _id: string;
  sessionId: string;
  toolName: string;
  toolArgs: Record<string, any>;
  requestedAt: number;
  status: "pending" | "approved" | "denied";
}

const CATEGORY_COLORS: Record<string, string> = {
  search: "bg-blue-500/20 text-blue-400",
  system: "bg-green-500/20 text-green-400",
  code: "bg-purple-500/20 text-purple-400",
  file: "bg-yellow-500/20 text-yellow-400",
};

export function ToolsTab() {
  const { data: session } = useSession();
  const { data: configData } = useFetch<Record<string, string>>("/api/config/all");
  const [tools, setTools] = useState<ToolRecord[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingApprovals, setLoadingApprovals] = useState(true);
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const gatewayId = (session?.user as any)?.gatewayId;
  const providerProfiles = parseProviderProfiles(configData?.["ai.provider_profiles"]);

  async function fetchApprovals() {
    try {
      const res = await gatewayFetch(`/api/approvals?gatewayId=${gatewayId}`);
      if (!res.ok) {
        if (res.status === 403) {
          setApprovals([]);
          setApprovalError("Only owner/admin can manage tool approvals.");
          return;
        }
        throw new Error("Failed to fetch approvals");
      }
      const data = await res.json();
      setApprovals(data.approvals || []);
      setApprovalError(null);
    } catch (err: any) {
      setApprovalError(err?.message || "Failed to fetch approvals");
    } finally {
      setLoadingApprovals(false);
    }
  }

  useEffect(() => {
    if (!gatewayId) return;
    gatewayFetch(`/api/tools?gatewayId=${gatewayId}`)
      .then((r) => r.json())
      .then((d) => setTools(d.tools || []))
      .catch(console.error)
      .finally(() => setLoading(false));

    fetchApprovals();
    const interval = setInterval(() => {
      fetchApprovals().catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [gatewayId]);

  async function toggleEnabled(tool: ToolRecord) {
    const newVal = !tool.enabled;
    setTools((prev) =>
      prev.map((t) => (t._id === tool._id ? { ...t, enabled: newVal } : t))
    );
    await gatewayFetch("/api/tools", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tool._id, enabled: newVal }),
    });
  }

  async function updateToolConfig(tool: ToolRecord, patch: Partial<ToolRecord>) {
    setTools((prev) => prev.map((t) => (t._id === tool._id ? { ...t, ...patch } : t)));
    try {
      const res = await gatewayFetch("/api/tools", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tool._id, ...patch }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch {
      // Revert by refetching current state
      gatewayFetch(`/api/tools?gatewayId=${gatewayId}`)
        .then((r) => r.json())
        .then((d) => setTools(d.tools || []))
        .catch(() => {});
    }
  }

  async function resolveApproval(approvalId: string, status: "approved" | "denied") {
    setResolvingApprovalId(approvalId);
    try {
      const res = await gatewayFetch(`/api/approvals/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to resolve approval");
      }
      setApprovals((prev) => prev.filter((a) => a._id !== approvalId));
    } catch (err: any) {
      alert(err?.message || "Failed to resolve approval");
    } finally {
      setResolvingApprovalId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Pending Tool Approvals</h3>
            <p className="text-xs text-zinc-400 mt-1">
              High-risk tools pause here until owner/admin approval.
            </p>
          </div>
          <button
            onClick={() => fetchApprovals()}
            className="px-2.5 py-1 text-xs rounded-md bg-white/[0.06] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.1]"
          >
            Refresh
          </button>
        </div>

        {approvalError && (
          <p className="mt-3 text-xs text-amber-300">{approvalError}</p>
        )}

        {loadingApprovals ? (
          <div className="mt-3 text-sm text-zinc-400">Loading approvals...</div>
        ) : approvals.length === 0 ? (
          <div className="mt-3 text-sm text-zinc-500">No pending approvals.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {approvals.map((approval) => (
              <div
                key={approval._id}
                className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-white font-medium">{approval.toolName}</div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {new Date(approval.requestedAt).toLocaleString()}
                    </div>
                    <pre className="mt-2 text-xs text-zinc-300 bg-black/30 rounded p-2 overflow-auto">
                      {JSON.stringify(approval.toolArgs || {}, null, 2)}
                    </pre>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => resolveApproval(approval._id, "approved")}
                      disabled={resolvingApprovalId === approval._id}
                      className="px-2.5 py-1 text-xs rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => resolveApproval(approval._id, "denied")}
                      disabled={resolvingApprovalId === approval._id}
                      className="px-2.5 py-1 text-xs rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 disabled:opacity-60"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Tools<HelpTooltip title="Tools" content="Tools extend your AI with abilities like web search, code execution, and file access. Enable or disable tools per channel." /></h2>
          <p className="text-sm text-zinc-400 mt-1">
            Enable or disable tools the AI agent can use during conversations.
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              const res = await gatewayFetch("/api/tools/cache", { method: "DELETE" });
              const data = await res.json();
              alert(`Cleared ${data.deleted || 0} cached tool results`);
            } catch { alert("Failed to clear cache"); }
          }}
          className="shrink-0 px-3 py-1.5 text-xs rounded-lg bg-white/[0.06] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.1] transition-all"
        >
          Clear Tool Cache
        </button>
      </div>

      <div className="space-y-3">
        {tools.map((tool) => (
          <div
            key={tool._id}
            className="flex items-center justify-between p-4 rounded-lg bg-white/[0.04] border border-white/[0.08]"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{tool.name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[tool.category] || "bg-white/[0.10]/20 text-zinc-400"}`}
                >
                  {tool.category}
                </span>
                {tool.requiresApproval && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                    Requires Approval
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-400 mt-1">{tool.description}</p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Provider Profile</label>
                  <select
                    value={tool.providerProfileId || ""}
                    onChange={(e) => {
                      const profileId = e.target.value;
                      const profile = providerProfiles.find((p) => p.id === profileId);
                      updateToolConfig(tool, {
                        providerProfileId: profileId || "",
                        provider: profile?.provider || "",
                      });
                    }}
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                  >
                    <option value="">Default (chat agent)</option>
                    {providerProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} ({profile.provider})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Model Override</label>
                  <input
                    value={tool.model || ""}
                    onChange={(e) => updateToolConfig(tool, { model: e.target.value })}
                    placeholder="Default"
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <button
              onClick={() => toggleEnabled(tool)}
              className={`ml-4 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                tool.enabled ? "bg-gradient-to-r from-blue-500 to-purple-500 shadow-[0_0_12px_rgba(59,130,246,0.25)]" : "bg-white/[0.12]"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  tool.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        ))}

        {tools.length === 0 && (
          <p className="text-zinc-500 text-center py-8">
            No tools configured. They will be seeded automatically.
          </p>
        )}
      </div>
    </div>
  );
}
