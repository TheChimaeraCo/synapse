"use client";
import { HelpTooltip } from "@/components/HelpTooltip";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { parseProviderProfiles } from "@/lib/aiRoutingConfig";
import { useFetch } from "@/lib/hooks";
import { ModelSearchInput } from "@/components/settings/ModelSearchInput";

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

interface IntegrationEndpointRecord {
  _id: string;
  integrationId: string;
  name: string;
  slug: string;
  toolName: string;
  method: string;
  path: string;
  description?: string;
  enabled: boolean;
  exposeAsTool: boolean;
  requiresApproval: boolean;
}

interface IntegrationRecord {
  _id: string;
  name: string;
  slug: string;
  type: "rest" | "mcp";
  baseUrl: string;
  authType: "none" | "bearer" | "header" | "query" | "basic";
  authConfig?: Record<string, any>;
  healthPath?: string;
  enabled: boolean;
  allowPrivateNetwork?: boolean;
  lastHealthStatus?: "healthy" | "degraded" | "down";
  lastHealthCode?: number;
  lastHealthError?: string;
  lastHealthAt?: number;
  secretStatus?: {
    hasToken?: boolean;
    hasValue?: boolean;
    hasPassword?: boolean;
  };
  endpoints: IntegrationEndpointRecord[];
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
  const { data: braveKeyData, refetch: refetchBraveKey } = useFetch<Record<string, string>>("/api/config?key=brave_search_api_key");
  const [tools, setTools] = useState<ToolRecord[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingApprovals, setLoadingApprovals] = useState(true);
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [braveApiKey, setBraveApiKey] = useState("");
  const [savingBraveKey, setSavingBraveKey] = useState(false);
  const [modelCache, setModelCache] = useState<Record<string, string[]>>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);
  const [syncingIntegrations, setSyncingIntegrations] = useState(false);
  const [checkingHealthId, setCheckingHealthId] = useState<string | null>(null);
  const [addingIntegration, setAddingIntegration] = useState(false);
  const [newIntegrationName, setNewIntegrationName] = useState("");
  const [newIntegrationType, setNewIntegrationType] = useState<"rest" | "mcp">("rest");
  const [newIntegrationBaseUrl, setNewIntegrationBaseUrl] = useState("");
  const [newIntegrationAuthType, setNewIntegrationAuthType] = useState<"none" | "bearer" | "header" | "query" | "basic">("none");
  const [newIntegrationHealthPath, setNewIntegrationHealthPath] = useState("/health");
  const [newIntegrationHeaderName, setNewIntegrationHeaderName] = useState("X-API-Key");
  const [newIntegrationQueryName, setNewIntegrationQueryName] = useState("api_key");
  const [newIntegrationUsername, setNewIntegrationUsername] = useState("");
  const [newIntegrationSecret, setNewIntegrationSecret] = useState("");
  const [endpointDrafts, setEndpointDrafts] = useState<Record<string, {
    name: string;
    method: string;
    path: string;
    description: string;
  }>>({});
  const [addingEndpointFor, setAddingEndpointFor] = useState<string | null>(null);

  const gatewayId = (session?.user as any)?.gatewayId;
  const providerProfiles = parseProviderProfiles(configData?.["ai.provider_profiles"]);
  const braveConfigured = Boolean(braveKeyData?.brave_search_api_key);

  const getAuthConfig = () => {
    if (newIntegrationAuthType === "header") return { headerName: newIntegrationHeaderName || "X-API-Key" };
    if (newIntegrationAuthType === "query") return { queryName: newIntegrationQueryName || "api_key" };
    if (newIntegrationAuthType === "basic") return { username: newIntegrationUsername || "" };
    return undefined;
  };

  const getSecretPayload = () => {
    if (newIntegrationAuthType === "bearer") return { token: newIntegrationSecret };
    if (newIntegrationAuthType === "header" || newIntegrationAuthType === "query") return { value: newIntegrationSecret };
    if (newIntegrationAuthType === "basic") return { password: newIntegrationSecret };
    return {};
  };

  const fetchModelsForProfile = async (profileId?: string, provider?: string) => {
    const key = profileId || provider || "_default";
    if (modelCache[key] || loadingModels[key]) return;
    setLoadingModels((prev) => ({ ...prev, [key]: true }));
    try {
      const params = new URLSearchParams();
      if (profileId) params.set("profileId", profileId);
      if (provider) params.set("provider", provider);
      const res = await gatewayFetch(`/api/config/models?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      const models = Array.isArray(data?.models)
        ? data.models.filter((m: unknown): m is string => typeof m === "string")
        : [];
      setModelCache((prev) => ({ ...prev, [key]: models }));
    } catch {
      // no-op
    } finally {
      setLoadingModels((prev) => ({ ...prev, [key]: false }));
    }
  };

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

  async function fetchIntegrations() {
    try {
      const res = await gatewayFetch("/api/integrations");
      if (!res.ok) throw new Error("Failed to load integrations");
      const data = await res.json();
      setIntegrations(data.integrations || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingIntegrations(false);
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
    fetchIntegrations();
    const interval = setInterval(() => {
      fetchApprovals().catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [gatewayId]);

  useEffect(() => {
    void fetchModelsForProfile();
    for (const tool of tools) {
      if (tool.providerProfileId || tool.provider) {
        void fetchModelsForProfile(tool.providerProfileId, tool.provider);
      }
    }
  }, [tools]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function saveBraveKey() {
    if (!braveApiKey.trim()) return;
    setSavingBraveKey(true);
    try {
      const saveConfigRes = await gatewayFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "brave_search_api_key", value: braveApiKey.trim() }),
      });
      if (!saveConfigRes.ok) throw new Error("Failed to save key");

      if (gatewayId) {
        const envRes = await gatewayFetch("/api/setup/save-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gatewayId,
            key: "brave_search_api_key",
            value: braveApiKey.trim(),
          }),
        });
        if (!envRes.ok) {
          // Non-blocking: key is already stored in Convex config.
          console.warn("[ToolsTab] Failed to mirror Brave key to Convex env");
        }
      }

      setBraveApiKey("");
      await refetchBraveKey();
      alert("Brave Search API key saved");
    } catch {
      alert("Failed to save Brave Search API key");
    } finally {
      setSavingBraveKey(false);
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

  async function createIntegration() {
    if (!newIntegrationName.trim() || !newIntegrationBaseUrl.trim()) {
      alert("Integration name and base URL are required.");
      return;
    }
    setAddingIntegration(true);
    try {
      const res = await gatewayFetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createIntegration",
          integration: {
            name: newIntegrationName.trim(),
            type: newIntegrationType,
            baseUrl: newIntegrationBaseUrl.trim(),
            authType: newIntegrationAuthType,
            authConfig: getAuthConfig(),
            healthPath: newIntegrationHealthPath.trim() || undefined,
            enabled: true,
          },
          secrets: getSecretPayload(),
        }),
      });
      if (!res.ok) throw new Error("Failed to create integration");
      setNewIntegrationName("");
      setNewIntegrationBaseUrl("");
      setNewIntegrationAuthType("none");
      setNewIntegrationHealthPath("/health");
      setNewIntegrationSecret("");
      setNewIntegrationUsername("");
      await fetchIntegrations();
    } catch (err: any) {
      alert(err?.message || "Failed to create integration");
    } finally {
      setAddingIntegration(false);
    }
  }

  async function runHealthCheck(integrationId: string) {
    setCheckingHealthId(integrationId);
    try {
      const res = await gatewayFetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "healthCheck", integrationId }),
      });
      if (!res.ok) throw new Error("Health check failed");
      await fetchIntegrations();
    } catch (err: any) {
      alert(err?.message || "Health check failed");
    } finally {
      setCheckingHealthId(null);
    }
  }

  async function syncIntegrationToolsNow(integrationId?: string) {
    setSyncingIntegrations(true);
    try {
      const res = await gatewayFetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", ...(integrationId ? { integrationId } : {}) }),
      });
      if (!res.ok) throw new Error("Failed to sync integration tools");
      await Promise.all([fetchIntegrations(), gatewayFetch(`/api/tools?gatewayId=${gatewayId}`)
        .then((r) => r.json())
        .then((d) => setTools(d.tools || []))]);
    } catch (err: any) {
      alert(err?.message || "Failed to sync integration tools");
    } finally {
      setSyncingIntegrations(false);
    }
  }

  async function updateIntegrationEnabled(integration: IntegrationRecord, enabled: boolean) {
    setIntegrations((prev) => prev.map((row) => row._id === integration._id ? { ...row, enabled } : row));
    try {
      const res = await gatewayFetch("/api/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateIntegration",
          id: integration._id,
          integration: { enabled },
        }),
      });
      if (!res.ok) throw new Error("Failed to update integration");
      await syncIntegrationToolsNow(integration._id);
    } catch {
      await fetchIntegrations();
    }
  }

  async function removeIntegration(integrationId: string) {
    if (!confirm("Delete this integration and all endpoints?")) return;
    try {
      const res = await gatewayFetch("/api/integrations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removeIntegration", id: integrationId }),
      });
      if (!res.ok) throw new Error("Failed to remove integration");
      await Promise.all([fetchIntegrations(), gatewayFetch(`/api/tools?gatewayId=${gatewayId}`)
        .then((r) => r.json())
        .then((d) => setTools(d.tools || []))]);
    } catch (err: any) {
      alert(err?.message || "Failed to remove integration");
    }
  }

  async function createEndpoint(integration: IntegrationRecord) {
    const draft = endpointDrafts[integration._id];
    if (!draft?.name?.trim() || !draft?.path?.trim()) {
      alert("Endpoint name and path are required.");
      return;
    }
    setAddingEndpointFor(integration._id);
    try {
      const res = await gatewayFetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createEndpoint",
          integrationId: integration._id,
          endpoint: {
            name: draft.name.trim(),
            method: draft.method || "GET",
            path: draft.path.trim(),
            description: draft.description?.trim() || undefined,
            enabled: true,
            exposeAsTool: true,
            requiresApproval: false,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to add endpoint");
      setEndpointDrafts((prev) => ({
        ...prev,
        [integration._id]: { name: "", method: "GET", path: "", description: "" },
      }));
      await syncIntegrationToolsNow(integration._id);
    } catch (err: any) {
      alert(err?.message || "Failed to add endpoint");
    } finally {
      setAddingEndpointFor(null);
    }
  }

  async function updateEndpointFlags(endpointId: string, patch: Partial<Pick<IntegrationEndpointRecord, "enabled" | "exposeAsTool">>) {
    try {
      const res = await gatewayFetch("/api/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateEndpoint",
          id: endpointId,
          endpoint: patch,
        }),
      });
      if (!res.ok) throw new Error("Failed to update endpoint");
      await fetchIntegrations();
    } catch (err: any) {
      alert(err?.message || "Failed to update endpoint");
      await fetchIntegrations();
    }
  }

  async function removeEndpoint(endpointId: string) {
    if (!confirm("Remove this endpoint?")) return;
    try {
      const res = await gatewayFetch("/api/integrations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removeEndpoint", id: endpointId }),
      });
      if (!res.ok) throw new Error("Failed to remove endpoint");
      await fetchIntegrations();
    } catch (err: any) {
      alert(err?.message || "Failed to remove endpoint");
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Web Search API Key</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Configure Brave Search for the <code>web_search</code> tool.
            </p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${braveConfigured ? "bg-green-500/20 text-green-300" : "bg-zinc-500/20 text-zinc-300"}`}>
            {braveConfigured ? "Configured" : "Not configured"}
          </span>
        </div>
        <div className="mt-3 flex flex-col md:flex-row gap-2">
          <input
            type="password"
            value={braveApiKey}
            onChange={(e) => setBraveApiKey(e.target.value)}
            placeholder="brv_... or your Brave Search API key"
            className="flex-1 bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
          />
          <button
            onClick={saveBraveKey}
            disabled={savingBraveKey || !braveApiKey.trim()}
            className="px-3 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
          >
            {savingBraveKey ? "Saving..." : "Save Key"}
          </button>
        </div>
      </div>

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

      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">API Integrations</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Register REST/MCP endpoints with auth once, then Synapse exposes them as tools automatically.
            </p>
          </div>
          <button
            onClick={() => syncIntegrationToolsNow()}
            disabled={syncingIntegrations}
            className="px-2.5 py-1 text-xs rounded-md bg-white/[0.06] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.1] disabled:opacity-50"
          >
            {syncingIntegrations ? "Syncing..." : "Sync Tools"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            value={newIntegrationName}
            onChange={(e) => setNewIntegrationName(e.target.value)}
            placeholder="Integration name (e.g. Sports Data)"
            className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
          />
          <input
            value={newIntegrationBaseUrl}
            onChange={(e) => setNewIntegrationBaseUrl(e.target.value)}
            placeholder="Base URL (https://api.example.com)"
            className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
          />
          <select
            value={newIntegrationType}
            onChange={(e) => setNewIntegrationType(e.target.value as any)}
            className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
          >
            <option value="rest">REST API</option>
            <option value="mcp">MCP (HTTP/JSON-RPC)</option>
          </select>
          <select
            value={newIntegrationAuthType}
            onChange={(e) => setNewIntegrationAuthType(e.target.value as any)}
            className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
          >
            <option value="none">No auth</option>
            <option value="bearer">Bearer token</option>
            <option value="header">Custom header</option>
            <option value="query">Query API key</option>
            <option value="basic">Basic auth</option>
          </select>
          <input
            value={newIntegrationHealthPath}
            onChange={(e) => setNewIntegrationHealthPath(e.target.value)}
            placeholder="Health path (/health)"
            className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
          />
          {newIntegrationAuthType === "header" && (
            <input
              value={newIntegrationHeaderName}
              onChange={(e) => setNewIntegrationHeaderName(e.target.value)}
              placeholder="Header name (X-API-Key)"
              className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
            />
          )}
          {newIntegrationAuthType === "query" && (
            <input
              value={newIntegrationQueryName}
              onChange={(e) => setNewIntegrationQueryName(e.target.value)}
              placeholder="Query key name (api_key)"
              className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
            />
          )}
          {newIntegrationAuthType === "basic" && (
            <input
              value={newIntegrationUsername}
              onChange={(e) => setNewIntegrationUsername(e.target.value)}
              placeholder="Basic auth username"
              className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
            />
          )}
          {newIntegrationAuthType !== "none" && (
            <input
              type="password"
              value={newIntegrationSecret}
              onChange={(e) => setNewIntegrationSecret(e.target.value)}
              placeholder={
                newIntegrationAuthType === "bearer"
                  ? "Bearer token"
                  : newIntegrationAuthType === "basic"
                    ? "Basic auth password"
                    : "API secret/key value"
              }
              className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
            />
          )}
        </div>
        <div className="flex items-center justify-end">
          <button
            onClick={createIntegration}
            disabled={addingIntegration}
            className="px-3 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
          >
            {addingIntegration ? "Creating..." : "Add Integration"}
          </button>
        </div>

        {loadingIntegrations ? (
          <div className="text-sm text-zinc-400">Loading integrations...</div>
        ) : integrations.length === 0 ? (
          <div className="text-sm text-zinc-500">No API integrations configured yet.</div>
        ) : (
          <div className="space-y-3">
            {integrations.map((integration) => {
              const draft = endpointDrafts[integration._id] || {
                name: "",
                method: "GET",
                path: "",
                description: "",
              };
              return (
                <div key={integration._id} className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">{integration.name}</div>
                      <div className="text-xs text-zinc-400 mt-1">
                        <code>{integration.baseUrl}</code> · {integration.type.toUpperCase()} · auth: {integration.authType}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        health: {integration.lastHealthStatus || "unknown"}
                        {integration.lastHealthCode ? ` (${integration.lastHealthCode})` : ""}
                        {integration.lastHealthAt ? ` · ${new Date(integration.lastHealthAt).toLocaleString()}` : ""}
                      </div>
                      {integration.lastHealthError && (
                        <div className="text-xs text-rose-300 mt-1">{integration.lastHealthError}</div>
                      )}
                      <div className="text-[11px] text-zinc-500 mt-1">
                        secrets: token {integration.secretStatus?.hasToken ? "configured" : "missing"} ·
                        value {integration.secretStatus?.hasValue ? "configured" : "missing"} ·
                        password {integration.secretStatus?.hasPassword ? "configured" : "missing"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => runHealthCheck(integration._id)}
                        disabled={checkingHealthId === integration._id}
                        className="px-2.5 py-1 text-xs rounded-md bg-white/[0.06] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.1] disabled:opacity-50"
                      >
                        {checkingHealthId === integration._id ? "Checking..." : "Health"}
                      </button>
                      <button
                        onClick={() => syncIntegrationToolsNow(integration._id)}
                        className="px-2.5 py-1 text-xs rounded-md bg-white/[0.06] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.1]"
                      >
                        Sync
                      </button>
                      <button
                        onClick={() => updateIntegrationEnabled(integration, !integration.enabled)}
                        className={`px-2.5 py-1 text-xs rounded-md border ${
                          integration.enabled
                            ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                            : "bg-zinc-500/20 border-zinc-500/30 text-zinc-300"
                        }`}
                      >
                        {integration.enabled ? "Enabled" : "Disabled"}
                      </button>
                      <button
                        onClick={() => removeIntegration(integration._id)}
                        className="px-2.5 py-1 text-xs rounded-md bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:bg-rose-500/30"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(integration.endpoints || []).map((endpoint) => (
                      <div key={endpoint._id} className="rounded-md border border-white/[0.08] bg-black/20 p-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs text-white">
                              <span className="text-blue-300">{endpoint.method.toUpperCase()}</span>{" "}
                              <code>{endpoint.path}</code> · {endpoint.name}
                            </div>
                            <div className="text-[11px] text-zinc-500 mt-1">
                              Tool: <code>{endpoint.toolName}</code>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => updateEndpointFlags(endpoint._id, { exposeAsTool: !endpoint.exposeAsTool })}
                              className={`px-2 py-0.5 text-[11px] rounded-md border ${
                                endpoint.exposeAsTool
                                  ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                                  : "bg-zinc-500/20 border-zinc-500/30 text-zinc-300"
                              }`}
                            >
                              {endpoint.exposeAsTool ? "Tool On" : "Tool Off"}
                            </button>
                            <button
                              onClick={() => updateEndpointFlags(endpoint._id, { enabled: !endpoint.enabled })}
                              className={`px-2 py-0.5 text-[11px] rounded-md border ${
                                endpoint.enabled
                                  ? "bg-blue-500/20 border-blue-500/30 text-blue-300"
                                  : "bg-zinc-500/20 border-zinc-500/30 text-zinc-300"
                              }`}
                            >
                              {endpoint.enabled ? "Enabled" : "Disabled"}
                            </button>
                            <button
                              onClick={() => removeEndpoint(endpoint._id)}
                              className="px-2 py-0.5 text-[11px] rounded-md bg-rose-500/20 border border-rose-500/30 text-rose-300"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input
                      value={draft.name}
                      onChange={(e) => setEndpointDrafts((prev) => ({
                        ...prev,
                        [integration._id]: { ...draft, name: e.target.value },
                      }))}
                      placeholder="Endpoint name"
                      className="bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                    />
                    <select
                      value={draft.method}
                      onChange={(e) => setEndpointDrafts((prev) => ({
                        ...prev,
                        [integration._id]: { ...draft, method: e.target.value },
                      }))}
                      className="bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                    <input
                      value={draft.path}
                      onChange={(e) => setEndpointDrafts((prev) => ({
                        ...prev,
                        [integration._id]: { ...draft, path: e.target.value },
                      }))}
                      placeholder="/resource/{id}"
                      className="bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                    />
                    <input
                      value={draft.description}
                      onChange={(e) => setEndpointDrafts((prev) => ({
                        ...prev,
                        [integration._id]: { ...draft, description: e.target.value },
                      }))}
                      placeholder="Description (optional)"
                      className="bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => createEndpoint(integration)}
                      disabled={addingEndpointFor === integration._id}
                      className="px-2.5 py-1 text-xs rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
                    >
                      {addingEndpointFor === integration._id ? "Adding..." : "Add Endpoint"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
                      if (profileId && profile) {
                        void fetchModelsForProfile(profileId, profile.provider);
                      }
                      updateToolConfig(tool, {
                        providerProfileId: profileId || "",
                        provider: profile?.provider || "",
                        model: "",
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
                  {(() => {
                    const profile = providerProfiles.find((p) => p.id === tool.providerProfileId);
                    const cacheKey = tool.providerProfileId || tool.provider || "_default";
                    const options = Array.from(new Set([
                      ...(modelCache[cacheKey] || modelCache._default || []),
                      profile?.defaultModel || "",
                      tool.model || "",
                    ].filter((value): value is string => typeof value === "string" && value.length > 0)));
                    return (
                      <div>
                        <ModelSearchInput
                          value={tool.model || ""}
                          onChange={(value) => updateToolConfig(tool, { model: value })}
                          options={options}
                          placeholder="Default"
                          className="w-full bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                          listId={`tool-model-${tool._id}`}
                        />
                        {loadingModels[cacheKey] && (
                          <p className="mt-1 text-[10px] text-zinc-500">Loading models...</p>
                        )}
                      </div>
                    );
                  })()}
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
