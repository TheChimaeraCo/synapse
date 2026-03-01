"use client";

import { useEffect, useMemo, useState } from "react";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { toast } from "sonner";

type IntegrationMode = "api" | "mcp";
type AuthType = "none" | "bearer" | "header" | "query" | "basic";

interface EndpointDraft {
  id: string;
  enabled: boolean;
  name: string;
  method: string;
  path: string;
  description?: string;
  source?: string;
}

interface UiActionPayload {
  mode?: IntegrationMode;
  name?: string;
  baseUrl?: string;
  docsUrl?: string;
  docsText?: string;
  healthPath?: string;
  authHint?: string;
  authConfig?: {
    headerName?: string;
    queryName?: string;
    username?: string;
  };
  confidence?: number;
  suggestedEndpoints?: Array<{
    name: string;
    method: string;
    path: string;
    description?: string;
    source?: string;
  }>;
  discoveryNote?: string;
}

function randomId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function toEndpointDraft(input: {
  name: string;
  method: string;
  path: string;
  description?: string;
  source?: string;
}): EndpointDraft {
  return {
    id: randomId("endpoint"),
    enabled: true,
    name: input.name || `${(input.method || "GET").toUpperCase()} ${input.path || "/"}`,
    method: (input.method || "GET").toUpperCase(),
    path: input.path || "/",
    description: input.description || "",
    source: input.source,
  };
}

function normalizeAuthHint(value?: string): AuthType {
  const v = String(value || "").toLowerCase().trim();
  if (v === "bearer" || v === "header" || v === "query" || v === "basic") return v;
  return "none";
}

export function IntegrationOnboardModal({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  const [mode, setMode] = useState<IntegrationMode>("api");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [docsUrl, setDocsUrl] = useState("");
  const [docsText, setDocsText] = useState("");
  const [healthPath, setHealthPath] = useState("/health");
  const [authType, setAuthType] = useState<AuthType>("none");
  const [headerName, setHeaderName] = useState("X-API-Key");
  const [queryName, setQueryName] = useState("api_key");
  const [username, setUsername] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [discoveryNote, setDiscoveryNote] = useState("");
  const [endpoints, setEndpoints] = useState<EndpointDraft[]>([]);

  const selectedCount = useMemo(
    () => endpoints.filter((row) => row.enabled && row.path.trim()).length,
    [endpoints],
  );

  useEffect(() => {
    const applyAutofill = (payload: UiActionPayload) => {
      const nextAuth = normalizeAuthHint(payload.authHint);
      if (payload.name) setName((prev) => (prev.trim() ? prev : String(payload.name || "")));
      if (payload.baseUrl) setBaseUrl((prev) => (prev.trim() ? prev : String(payload.baseUrl || "")));
      if (payload.docsText) setDocsText((prev) => (prev.trim() ? prev : String(payload.docsText || "")));
      if (payload.healthPath) {
        setHealthPath((prev) => {
          const p = prev.trim();
          if (p && p !== "/health") return prev;
          return String(payload.healthPath || "/health");
        });
      }
      if (nextAuth !== "none") {
        setAuthType((prev) => (prev === "none" ? nextAuth : prev));
      }
      if (payload.authConfig?.headerName) {
        setHeaderName((prev) => (prev === "X-API-Key" ? String(payload.authConfig?.headerName || prev) : prev));
      }
      if (payload.authConfig?.queryName) {
        setQueryName((prev) => (prev === "api_key" ? String(payload.authConfig?.queryName || prev) : prev));
      }
      if (payload.authConfig?.username) {
        setUsername((prev) => (prev.trim() ? prev : String(payload.authConfig?.username || "")));
      }
    };

    const handler = (event: Event) => {
      const custom = event as CustomEvent<any>;
      if (!custom.detail || custom.detail.sessionId !== sessionId) return;
      const action = custom.detail.action;
      if (!action || action.type !== "integration_onboard") return;
      const payload = (action.payload || {}) as UiActionPayload;

      setMode(payload.mode === "mcp" ? "mcp" : "api");
      setName(String(payload.name || ""));
      setBaseUrl(String(payload.baseUrl || ""));
      setDocsUrl(String(payload.docsUrl || ""));
      setDocsText(String(payload.docsText || ""));
      setHealthPath(String(payload.healthPath || "/health"));
      setAuthType(normalizeAuthHint(payload.authHint));
      setHeaderName(String(payload.authConfig?.headerName || "X-API-Key"));
      setQueryName(String(payload.authConfig?.queryName || "api_key"));
      setUsername(String(payload.authConfig?.username || ""));
      setSecretValue("");
      setDiscoveryNote(String(payload.discoveryNote || ""));
      setEndpoints((payload.suggestedEndpoints || []).map(toEndpointDraft));
      applyAutofill(payload);
      setOpen(true);
    };

    window.addEventListener("synapse:ui_action", handler as EventListener);
    return () => window.removeEventListener("synapse:ui_action", handler as EventListener);
  }, [sessionId]);

  const close = () => {
    if (saving || discovering) return;
    setOpen(false);
  };

  const addEndpointRow = () => {
    setEndpoints((prev) => [
      ...prev,
      {
        id: randomId("endpoint"),
        enabled: true,
        name: "",
        method: "GET",
        path: "/",
        description: "",
      },
    ]);
  };

  const discoverEndpoints = async () => {
    if (!baseUrl.trim() && !docsUrl.trim() && !docsText.trim()) {
      toast.error("Add a base URL, docs URL, or docs text first.");
      return;
    }
    setDiscovering(true);
    try {
      const res = await gatewayFetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "discoverEndpoints",
          baseUrl: baseUrl.trim() || undefined,
          docsUrl: docsUrl.trim() || undefined,
          docsText: docsText.trim() || undefined,
          aiAssist: true,
          maxEndpoints: 40,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Endpoint discovery failed");
      const rows = Array.isArray(data.endpoints) ? data.endpoints.map(toEndpointDraft) : [];
      setEndpoints(rows);
      const discoveredNote = rows.length > 0 ? `Discovered ${rows.length} endpoint(s).` : "No endpoints discovered.";
      const extraNote = Array.isArray(data.notes) ? data.notes.filter(Boolean).join(" ") : "";
      const confidence = Number(data?.autofill?.confidence);
      const confidenceText = Number.isFinite(confidence) ? ` Confidence: ${Math.round(confidence)}%.` : "";
      setDiscoveryNote(`${discoveredNote}${confidenceText}${extraNote ? ` ${extraNote}` : ""}`.trim());

      if (data?.autofill) {
        const autofill = data.autofill;
        if (autofill.name) setName((prev) => (prev.trim() ? prev : String(autofill.name)));
        if (autofill.baseUrl) setBaseUrl((prev) => (prev.trim() ? prev : String(autofill.baseUrl)));
        if (autofill.healthPath) {
          setHealthPath((prev) => (prev.trim() && prev.trim() !== "/health" ? prev : String(autofill.healthPath)));
        }
        if (autofill.authHint) {
          setAuthType((prev) => (prev === "none" ? normalizeAuthHint(autofill.authHint) : prev));
        }
        if (autofill.authConfig?.headerName) {
          setHeaderName((prev) => (prev === "X-API-Key" ? String(autofill.authConfig.headerName) : prev));
        }
        if (autofill.authConfig?.queryName) {
          setQueryName((prev) => (prev === "api_key" ? String(autofill.authConfig.queryName) : prev));
        }
        if (autofill.authConfig?.username) {
          setUsername((prev) => (prev.trim() ? prev : String(autofill.authConfig.username)));
        }
      }

      toast.success(rows.length > 0 ? `Discovered ${rows.length} endpoint(s)` : "No endpoints found");
    } catch (err: any) {
      toast.error(err?.message || "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  };

  const saveIntegration = async () => {
    if (!name.trim() || !baseUrl.trim()) {
      toast.error("Integration name and base URL are required.");
      return;
    }

    const selected = endpoints
      .filter((row) => row.enabled && row.path.trim())
      .map((row) => ({
        name: row.name.trim() || `${row.method.toUpperCase()} ${row.path.trim()}`,
        method: row.method.toUpperCase(),
        path: row.path.trim(),
        description: row.description?.trim() || undefined,
        enabled: true,
        exposeAsTool: true,
        requiresApproval: false,
      }));

    const authConfig =
      authType === "header"
        ? { headerName: headerName || "X-API-Key" }
        : authType === "query"
          ? { queryName: queryName || "api_key" }
          : authType === "basic"
            ? { username: username || "" }
            : undefined;

    const secrets =
      authType === "bearer"
        ? { token: secretValue }
        : authType === "header" || authType === "query"
          ? { value: secretValue }
          : authType === "basic"
            ? { password: secretValue }
            : {};

    setSaving(true);
    try {
      const res = await gatewayFetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createIntegration",
          integration: {
            name: name.trim(),
            type: mode === "mcp" ? "mcp" : "rest",
            baseUrl: baseUrl.trim(),
            authType,
            authConfig,
            healthPath: healthPath.trim() || undefined,
            enabled: true,
          },
          secrets,
          endpoints: selected,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to save integration");
      toast.success(`Integration saved${selectedCount > 0 ? ` with ${selectedCount} endpoint(s)` : ""}`);
      setOpen(false);
      window.dispatchEvent(new Event("synapse:agent_update"));
    } catch (err: any) {
      toast.error(err?.message || "Failed to save integration");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Secure Integration Setup</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Add API/MCP credentials securely and map endpoints as tools.
            </p>
          </div>
          <button
            onClick={close}
            className="rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Integration name"
              className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
            />
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as IntegrationMode)}
              className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
            >
              <option value="api">REST API</option>
              <option value="mcp">MCP (HTTP)</option>
            </select>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="Base URL (https://api.example.com)"
              className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
            />
            <input
              value={docsUrl}
              onChange={(e) => setDocsUrl(e.target.value)}
              placeholder="Docs/OpenAPI URL (optional)"
              className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
            />
            <textarea
              value={docsText}
              onChange={(e) => setDocsText(e.target.value)}
              placeholder="Paste docs snippets/endpoint docs here (optional)"
              rows={4}
              className="md:col-span-2 bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none resize-y"
            />
            <input
              value={healthPath}
              onChange={(e) => setHealthPath(e.target.value)}
              placeholder="/health"
              className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
            />
            <select
              value={authType}
              onChange={(e) => setAuthType(e.target.value as AuthType)}
              className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
            >
              <option value="none">No auth</option>
              <option value="bearer">Bearer token</option>
              <option value="header">Custom header API key</option>
              <option value="query">Query API key</option>
              <option value="basic">Basic auth</option>
            </select>

            {authType === "header" && (
              <input
                value={headerName}
                onChange={(e) => setHeaderName(e.target.value)}
                placeholder="Header name (X-API-Key)"
                className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
              />
            )}
            {authType === "query" && (
              <input
                value={queryName}
                onChange={(e) => setQueryName(e.target.value)}
                placeholder="Query key name (api_key)"
                className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
              />
            )}
            {authType === "basic" && (
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Basic auth username"
                className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
              />
            )}

            {authType !== "none" && (
              <input
                type="password"
                autoComplete="off"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                placeholder={
                  authType === "bearer"
                    ? "Bearer token"
                    : authType === "basic"
                      ? "Basic auth password"
                      : "API key value"
                }
                className="bg-white/[0.04] border border-white/[0.1] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none"
              />
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
            <div className="text-xs text-zinc-400">
              {discoveryNote || "Discover endpoints from OpenAPI/docs, or add them manually."}
            </div>
            <button
              onClick={discoverEndpoints}
              disabled={discovering}
              className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-50"
            >
              {discovering ? "Discovering..." : "Discover Endpoints"}
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold tracking-wide uppercase text-zinc-400">Endpoints</h4>
              <button
                onClick={addEndpointRow}
                className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
              >
                Add Row
              </button>
            </div>
            {endpoints.length === 0 && (
              <div className="text-xs text-zinc-500 border border-dashed border-white/10 rounded-md p-3">
                No endpoints yet. Discover endpoints or add rows manually.
              </div>
            )}
            {endpoints.map((row) => (
              <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center rounded-md border border-white/10 p-2">
                <label className="md:col-span-1 flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) =>
                      setEndpoints((prev) =>
                        prev.map((ep) => (ep.id === row.id ? { ...ep, enabled: e.target.checked } : ep)),
                      )
                    }
                  />
                  Use
                </label>
                <input
                  value={row.name}
                  onChange={(e) =>
                    setEndpoints((prev) => prev.map((ep) => (ep.id === row.id ? { ...ep, name: e.target.value } : ep)))
                  }
                  placeholder="Name"
                  className="md:col-span-3 bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                />
                <select
                  value={row.method}
                  onChange={(e) =>
                    setEndpoints((prev) => prev.map((ep) => (ep.id === row.id ? { ...ep, method: e.target.value } : ep)))
                  }
                  className="md:col-span-2 bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
                <input
                  value={row.path}
                  onChange={(e) =>
                    setEndpoints((prev) => prev.map((ep) => (ep.id === row.id ? { ...ep, path: e.target.value } : ep)))
                  }
                  placeholder="/path/{id}"
                  className="md:col-span-3 bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                />
                <button
                  onClick={() => setEndpoints((prev) => prev.filter((ep) => ep.id !== row.id))}
                  className="md:col-span-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300"
                >
                  Remove
                </button>
                <input
                  value={row.description || ""}
                  onChange={(e) =>
                    setEndpoints((prev) =>
                      prev.map((ep) => (ep.id === row.id ? { ...ep, description: e.target.value } : ep)),
                    )
                  }
                  placeholder="Description (optional)"
                  className="md:col-span-12 bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
          <p className="text-xs text-zinc-400">
            Selected endpoints: <span className="text-zinc-200">{selectedCount}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={close}
              disabled={saving}
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={saveIntegration}
              disabled={saving}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Integration"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
