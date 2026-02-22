"use client";

import { useEffect, useMemo, useState } from "react";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Route } from "lucide-react";
import { toast } from "sonner";
import { useFetch } from "@/lib/hooks";
import { parseProviderProfiles, type CapabilityRoutes } from "@/lib/aiRoutingConfig";

interface RouteCondition {
  type: "message_length" | "has_code" | "keyword" | "combined";
  minLength?: number;
  maxLength?: number;
  codeDetection?: boolean;
  keywords?: string[];
}

interface ModelRoute {
  _id?: string;
  name: string;
  description: string;
  condition: RouteCondition;
  targetModel: string;
  targetProvider?: string;
  targetProviderProfileId?: string;
  priority: number;
  enabled: boolean;
}

const CONDITION_TYPES = [
  { value: "message_length", label: "Message Length" },
  { value: "has_code", label: "Contains Code" },
  { value: "keyword", label: "Keyword Match" },
];

const CAPABILITIES = [
  { key: "chat", label: "Chat" },
  { key: "tool_use", label: "Tool Use" },
  { key: "summary", label: "Summary" },
  { key: "code", label: "Code" },
  { key: "analysis", label: "Analysis" },
  { key: "file_read", label: "File Reading (General)" },
  { key: "pdf_read", label: "PDF Reading" },
  { key: "image_read", label: "Image Reading" },
  { key: "excel_read", label: "Excel Reading" },
] as const;

function RouteEditor({
  route,
  onSave,
  onDelete,
  profileOptions,
}: {
  route: ModelRoute;
  onSave: (r: ModelRoute) => void;
  onDelete?: () => void;
  profileOptions: Array<{ id: string; name: string; provider: string }>;
}) {
  const [expanded, setExpanded] = useState(!route._id);
  const [form, setForm] = useState(route);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02]" onClick={() => setExpanded(!expanded)}>
        <button
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setForm({ ...form, enabled: !form.enabled });
            onSave({ ...form, enabled: !form.enabled });
          }}
        >
          {form.enabled
            ? <ToggleRight className="h-5 w-5 text-green-400" />
            : <ToggleLeft className="h-5 w-5 text-zinc-600" />
          }
        </button>
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-medium ${form.enabled ? "text-zinc-200" : "text-zinc-500"}`}>{form.name || "New Rule"}</span>
          <span className="text-xs text-zinc-500 ml-2">to {form.targetModel || "(default)"}</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono">P{form.priority}</span>
        {expanded ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500/40"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Priority</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value, 10) || 0 })}
                className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500/40"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500/40"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Provider Profile</label>
              <select
                value={form.targetProviderProfileId || ""}
                onChange={(e) => {
                  const profileId = e.target.value;
                  const profile = profileOptions.find((p) => p.id === profileId);
                  setForm({
                    ...form,
                    targetProviderProfileId: profileId || "",
                    targetProvider: profile?.provider || "",
                  });
                }}
                className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none"
              >
                <option value="">Default profile</option>
                {profileOptions.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name} ({profile.provider})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Target Model</label>
              <input
                value={form.targetModel}
                onChange={(e) => setForm({ ...form, targetModel: e.target.value })}
                placeholder="e.g. claude-sonnet-4-20250514"
                className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Condition Type</label>
            <select
              value={form.condition.type}
              onChange={(e) => {
                const type = e.target.value as RouteCondition["type"];
                const base: RouteCondition = { type };
                if (type === "message_length") base.maxLength = 50;
                if (type === "has_code") base.codeDetection = true;
                if (type === "keyword") base.keywords = [];
                setForm({ ...form, condition: base });
              }}
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500/40"
            >
              {CONDITION_TYPES.map((ct) => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
            </select>
          </div>

          {form.condition.type === "message_length" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Min Length</label>
                <input type="number" value={form.condition.minLength ?? ""} onChange={(e) => setForm({ ...form, condition: { ...form.condition, minLength: e.target.value ? parseInt(e.target.value, 10) : undefined } })} className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none" placeholder="0" />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Max Length</label>
                <input type="number" value={form.condition.maxLength ?? ""} onChange={(e) => setForm({ ...form, condition: { ...form.condition, maxLength: e.target.value ? parseInt(e.target.value, 10) : undefined } })} className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none" placeholder="No limit" />
              </div>
            </div>
          )}

          {form.condition.type === "has_code" && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={form.condition.codeDetection ?? true} onChange={(e) => setForm({ ...form, condition: { ...form.condition, codeDetection: e.target.checked } })} className="rounded" />
              Match messages containing code
            </label>
          )}

          {form.condition.type === "keyword" && (
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">Keywords (comma-separated)</label>
              <input
                value={(form.condition.keywords || []).join(", ")}
                onChange={(e) => setForm({ ...form, condition: { ...form.condition, keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
                className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none"
                placeholder="hello, hi, thanks"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            {onDelete && (
              <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            )}
            <Button size="sm" onClick={() => onSave(form)} className="bg-blue-600 hover:bg-blue-500 text-white">
              Save Rule
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ModelRoutingTab() {
  const { data: configData } = useFetch<Record<string, string>>("/api/config/all");
  const profileOptions = useMemo(() => parseProviderProfiles(configData?.["ai.provider_profiles"]), [configData]);

  const [routes, setRoutes] = useState<ModelRoute[]>([]);
  const [capabilityRoutes, setCapabilityRoutes] = useState<CapabilityRoutes>({});
  const [loading, setLoading] = useState(true);
  const [savingCapabilities, setSavingCapabilities] = useState(false);

  // Cache of fetched models per provider/profile
  const [modelCache, setModelCache] = useState<Record<string, string[]>>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});

  const fetchModelsForProfile = async (profileId: string, provider: string) => {
    const cacheKey = profileId || provider || "_default";
    if (modelCache[cacheKey] || loadingModels[cacheKey]) return;
    setLoadingModels((prev) => ({ ...prev, [cacheKey]: true }));
    try {
      const params = new URLSearchParams();
      if (profileId) params.set("profileId", profileId);
      if (provider) params.set("provider", provider);
      const res = await gatewayFetch(`/api/config/models?${params}`);
      if (res.ok) {
        const data = await res.json();
        setModelCache((prev) => ({ ...prev, [cacheKey]: data.models || [] }));
      }
    } catch {}
    setLoadingModels((prev) => ({ ...prev, [cacheKey]: false }));
  };

  // Fetch models for all capability profiles on load + when profiles change
  useEffect(() => {
    // Fetch default models
    fetchModelsForProfile("", "");
    // Fetch for each configured capability
    for (const { key } of CAPABILITIES) {
      const cap = capabilityRoutes[key];
      if (cap?.providerProfileId || cap?.provider) {
        fetchModelsForProfile(cap.providerProfileId || "", cap.provider || "");
      }
    }
    // Fetch for each profile option
    for (const p of profileOptions) {
      fetchModelsForProfile(p.id, p.provider);
    }
  }, [capabilityRoutes, profileOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRoutes = async () => {
    try {
      const [ruleRes, capabilityRes] = await Promise.all([
        gatewayFetch("/api/config/models/routes"),
        gatewayFetch("/api/config/models/routing"),
      ]);
      if (ruleRes.ok) setRoutes(await ruleRes.json());
      if (capabilityRes.ok) setCapabilityRoutes(await capabilityRes.json());
    } catch {
      // ignore
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRoutes();
  }, []);

  const saveCapabilityRoutes = async () => {
    setSavingCapabilities(true);
    try {
      const res = await gatewayFetch("/api/config/models/routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(capabilityRoutes),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Capability defaults saved");
    } catch {
      toast.error("Failed to save capability defaults");
    } finally {
      setSavingCapabilities(false);
    }
  };

  const saveRoute = async (route: ModelRoute) => {
    try {
      if (route._id) {
        await gatewayFetch("/api/config/models/routes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: route._id, ...route }),
        });
      } else {
        await gatewayFetch("/api/config/models/routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(route),
        });
      }
      toast.success("Route saved");
      loadRoutes();
    } catch {
      toast.error("Failed to save route");
    }
  };

  const deleteRoute = async (id: string) => {
    try {
      await gatewayFetch(`/api/config/models/routes?id=${id}`, { method: "DELETE" });
      toast.success("Route deleted");
      loadRoutes();
    } catch {
      toast.error("Failed to delete route");
    }
  };

  const addDefault = () => {
    setRoutes([
      ...routes,
      {
        name: "",
        description: "",
        condition: { type: "keyword", keywords: [] },
        targetModel: "",
        targetProvider: "",
        targetProviderProfileId: "",
        priority: 10,
        enabled: true,
      },
    ]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
          <Route className="h-5 w-5 text-blue-400" /> Model Routing Rules
        </h2>
        <p className="text-xs text-zinc-500 mt-1">
          Configure provider/model defaults per capability and add conditional message routing rules.
        </p>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-200">Capability Defaults</h3>
        <div className="space-y-2">
          {CAPABILITIES.map(({ key, label }) => (
            <div key={key} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
              <div className="text-xs text-zinc-400 uppercase tracking-wide">{label}</div>
              <select
                value={capabilityRoutes[key]?.providerProfileId || ""}
                onChange={(e) => {
                  const profileId = e.target.value;
                  const profile = profileOptions.find((p) => p.id === profileId);
                  setCapabilityRoutes((prev) => ({
                    ...prev,
                    [key]: {
                      ...(prev[key] || {}),
                      providerProfileId: profileId || "",
                      provider: profile?.provider || "",
                      model: "", // Reset model when provider changes
                    },
                  }));
                  // Fetch models for the new profile
                  if (profileId && profile) {
                    fetchModelsForProfile(profileId, profile.provider);
                  }
                }}
                className="w-full bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
              >
                <option value="">Default provider profile</option>
                {profileOptions.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name} ({profile.provider})</option>
                ))}
              </select>
              {(() => {
                const cap = capabilityRoutes[key];
                const cacheKey = cap?.providerProfileId || cap?.provider || "_default";
                const models = modelCache[cacheKey] || modelCache["_default"] || [];
                const currentValue = cap?.model || "";
                return (
                  <div className="relative">
                    <select
                      value={models.includes(currentValue) ? currentValue : "__custom__"}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "__custom__") return;
                        setCapabilityRoutes((prev) => ({
                          ...prev,
                          [key]: { ...(prev[key] || {}), model: val },
                        }));
                      }}
                      className="w-full bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                    >
                      <option value="">Select model...</option>
                      {currentValue && !models.includes(currentValue) && (
                        <option value="__custom__">{currentValue} (custom)</option>
                      )}
                      {models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    {loadingModels[cacheKey] && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">Loading...</div>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={saveCapabilityRoutes} disabled={savingCapabilities}>
            {savingCapabilities ? "Saving..." : "Save Capability Defaults"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-14 bg-white/[0.04] rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map((route, i) => (
            <RouteEditor
              key={route._id || `new-${i}`}
              route={route}
              onSave={saveRoute}
              onDelete={route._id ? () => deleteRoute(route._id as string) : undefined}
              profileOptions={profileOptions}
            />
          ))}
          {routes.length === 0 && (
            <div className="text-center py-8 text-zinc-500 text-sm">
              No conditional routing rules configured. Capability defaults will be used.
            </div>
          )}
        </div>
      )}

      <Button variant="ghost" onClick={addDefault} className="text-blue-400 hover:text-blue-300">
        <Plus className="h-4 w-4 mr-1" /> Add Rule
      </Button>
    </div>
  );
}
