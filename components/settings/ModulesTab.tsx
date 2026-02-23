"use client";

import { useEffect, useMemo, useState } from "react";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { useFetch } from "@/lib/hooks";
import { parseProviderProfiles } from "@/lib/aiRoutingConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Upload, Package, RefreshCw } from "lucide-react";

interface ModuleManifest {
  manifestVersion: 1;
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  toolPrefixes?: string[];
  routes?: Array<{ path: string; title?: string; icon?: string }>;
}

interface InstalledModuleRecord {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  toolPrefixes?: string[];
  routes?: Array<{ path: string; title?: string; icon?: string }>;
  enabled: boolean;
  source: "local" | "registry" | "imported";
  installedAt: number;
  updatedAt?: number;
}

interface ModuleRouteConfig {
  mode?: "default" | "module";
  providerProfileId?: string;
  provider?: string;
  model?: string;
}

interface LocalEntry {
  manifest: ModuleManifest;
  source: "local" | "imported";
  sourcePath: string;
  installed: boolean;
  enabled: boolean;
}

interface RegistryEntry {
  manifest: ModuleManifest;
  packagePath: string;
  installed: boolean;
  enabled: boolean;
}

interface ModulesResponse {
  installed: InstalledModuleRecord[];
  routes: Record<string, ModuleRouteConfig>;
  local: LocalEntry[];
  registry: RegistryEntry[];
}

function sourceBadgeVariant(source: InstalledModuleRecord["source"]): "default" | "secondary" | "outline" {
  if (source === "registry") return "default";
  if (source === "imported") return "secondary";
  return "outline";
}

export function ModulesTab() {
  const { data, loading, error, refetch } = useFetch<ModulesResponse>("/api/modules");
  const { data: configData } = useFetch<Record<string, string>>("/api/config/all");
  const profileOptions = useMemo(() => parseProviderProfiles(configData?.["ai.provider_profiles"]), [configData]);

  const [routeDrafts, setRouteDrafts] = useState<Record<string, ModuleRouteConfig>>({});
  const [importJson, setImportJson] = useState("");
  const [exportedPackage, setExportedPackage] = useState("");
  const [busyAction, setBusyAction] = useState<string>("");
  const [modelCache, setModelCache] = useState<Record<string, string[]>>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!data?.routes) return;
    setRouteDrafts(data.routes);
  }, [data?.routes]);

  const installed = data?.installed || [];
  const local = data?.local || [];
  const registry = data?.registry || [];

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
      const payload = await res.json();
      const models = Array.isArray(payload?.models)
        ? payload.models.filter((m: unknown): m is string => typeof m === "string")
        : [];
      setModelCache((prev) => ({ ...prev, [key]: models }));
    } catch {
      // no-op
    } finally {
      setLoadingModels((prev) => ({ ...prev, [key]: false }));
    }
  };

  useEffect(() => {
    void fetchModelsForProfile();
    for (const route of Object.values(routeDrafts)) {
      if (route?.providerProfileId || route?.provider) {
        void fetchModelsForProfile(route.providerProfileId, route.provider);
      }
    }
  }, [routeDrafts]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runAction(action: string, payload: Record<string, unknown>) {
    setBusyAction(action);
    try {
      const res = await gatewayFetch("/api/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Request failed");
      return json as Record<string, unknown>;
    } finally {
      setBusyAction("");
    }
  }

  async function install(moduleId: string, version?: string) {
    try {
      await runAction("install", { moduleId, version });
      toast.success(`Installed ${moduleId}`);
      await refetch();
    } catch (err: any) {
      toast.error(err?.message || `Failed to install ${moduleId}`);
    }
  }

  async function uninstall(moduleId: string) {
    try {
      await runAction("uninstall", { moduleId });
      toast.success(`Uninstalled ${moduleId}`);
      await refetch();
    } catch (err: any) {
      toast.error(err?.message || `Failed to uninstall ${moduleId}`);
    }
  }

  async function toggle(moduleId: string, enabled: boolean) {
    try {
      await runAction("toggle", { moduleId, enabled });
      toast.success(`${enabled ? "Enabled" : "Disabled"} ${moduleId}`);
      await refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update module");
    }
  }

  async function saveRoute(moduleId: string) {
    try {
      const route = routeDrafts[moduleId] || { mode: "default" };
      await runAction("setRouting", { moduleId, route });
      toast.success(`Saved routing for ${moduleId}`);
      await refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save routing");
    }
  }

  async function exportModule(moduleId: string, version?: string) {
    try {
      const result = await runAction("export", { moduleId, version });
      const pkg = result?.package;
      setExportedPackage(JSON.stringify(pkg, null, 2));
      toast.success(`Exported ${moduleId}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to export module");
    }
  }

  async function importModule() {
    if (!importJson.trim()) return;
    try {
      await runAction("import", { packageJson: importJson, install: true });
      setImportJson("");
      toast.success("Module imported");
      await refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to import module");
    }
  }

  if (loading) {
    return <div className="text-zinc-400">Loading modules...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Modules</h2>
        <p className="text-sm text-zinc-400">
          Install local/imported modules and configure provider/model routing per module.
        </p>
      </div>

      {error && (
        <Card className="bg-red-500/10 border-red-500/30">
          <CardContent className="pt-6 text-sm text-red-200">{error}</CardContent>
        </Card>
      )}

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <Package className="h-4 w-4" /> Installed Modules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {installed.length === 0 && (
            <p className="text-sm text-zinc-500">No modules installed yet.</p>
          )}

          {installed.map((mod) => {
            const draft = routeDrafts[mod.id] || { mode: "default" as const };
            const routeMode = draft.mode || "default";
            const cacheKey = draft.providerProfileId || draft.provider || "_default";
            const modelOptions = modelCache[cacheKey] || modelCache._default || [];
            const modelValue = draft.model || "";
            const hasKnownModel = modelValue ? modelOptions.includes(modelValue) : true;

            return (
              <div key={mod.id} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{mod.name}</span>
                      <Badge variant="outline">{mod.id}</Badge>
                      <Badge variant={sourceBadgeVariant(mod.source)}>{mod.source}</Badge>
                      <Badge variant="secondary">v{mod.version}</Badge>
                    </div>
                    {mod.description && <p className="text-xs text-zinc-400 mt-1">{mod.description}</p>}
                    {mod.toolPrefixes && mod.toolPrefixes.length > 0 && (
                      <p className="text-xs text-zinc-500 mt-1">Tool prefixes: {mod.toolPrefixes.join(", ")}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle checked={mod.enabled} onChange={(v) => void toggle(mod.id, v)} />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-zinc-300"
                      onClick={() => void exportModule(mod.id, mod.version)}
                      disabled={busyAction === "export"}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Export
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-300 hover:text-red-200"
                      onClick={() => void uninstall(mod.id)}
                      disabled={busyAction === "uninstall"}
                    >
                      Uninstall
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <select
                    value={routeMode}
                    onChange={(e) => {
                      const mode = e.target.value === "module" ? "module" : "default";
                      setRouteDrafts((prev) => ({ ...prev, [mod.id]: { ...(prev[mod.id] || {}), mode } }));
                    }}
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                  >
                    <option value="default">Default chat agent</option>
                    <option value="module">Module-specific routing</option>
                  </select>

                  <select
                    value={draft.providerProfileId || ""}
                    disabled={routeMode !== "module"}
                    onChange={(e) => {
                      const profileId = e.target.value;
                      const profile = profileOptions.find((p) => p.id === profileId);
                      setRouteDrafts((prev) => ({
                        ...prev,
                        [mod.id]: {
                          ...(prev[mod.id] || {}),
                          providerProfileId: profileId || "",
                          provider: profile?.provider || "",
                          model: "",
                        },
                      }));
                      if (profileId && profile) {
                        void fetchModelsForProfile(profileId, profile.provider);
                      }
                    }}
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none disabled:opacity-50"
                  >
                    <option value="">Default provider profile</option>
                    {profileOptions.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} ({profile.provider})
                      </option>
                    ))}
                  </select>

                  <select
                    value={hasKnownModel ? modelValue : "__custom__"}
                    disabled={routeMode !== "module"}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "__custom__") return;
                      setRouteDrafts((prev) => ({
                        ...prev,
                        [mod.id]: { ...(prev[mod.id] || {}), model: value },
                      }));
                    }}
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none disabled:opacity-50"
                  >
                    <option value="">Select model...</option>
                    {!hasKnownModel && modelValue && (
                      <option value="__custom__">{modelValue} (custom)</option>
                    )}
                    {modelOptions.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>

                  <Button
                    size="sm"
                    onClick={() => void saveRoute(mod.id)}
                    disabled={busyAction === "setRouting"}
                  >
                    Save Routing
                  </Button>
                </div>

                {routeMode === "module" && (!hasKnownModel || modelOptions.length === 0) && (
                  <Input
                    value={draft.model || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setRouteDrafts((prev) => ({
                        ...prev,
                        [mod.id]: { ...(prev[mod.id] || {}), model: value },
                      }));
                    }}
                    placeholder="Custom model id"
                    className="bg-white/[0.06] border-white/[0.08] text-white"
                  />
                )}

                {loadingModels[cacheKey] && (
                  <p className="text-[11px] text-zinc-500">Loading models...</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Available Local / Imported Modules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {local.length === 0 && <p className="text-sm text-zinc-500">No local modules found under `modules/`.</p>}
          {local.map((entry) => (
            <div key={`${entry.source}:${entry.manifest.id}:${entry.manifest.version}`} className="flex items-center justify-between rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2">
              <div>
                <div className="text-sm text-zinc-200">
                  {entry.manifest.name} <span className="text-zinc-500">({entry.manifest.id})</span>
                </div>
                <div className="text-xs text-zinc-500">{entry.source} - v{entry.manifest.version}</div>
              </div>
              <Button
                size="sm"
                onClick={() => void install(entry.manifest.id, entry.manifest.version)}
                disabled={busyAction === "install"}
              >
                {entry.installed ? "Reinstall" : "Install"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Registry Packages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {registry.length === 0 && <p className="text-sm text-zinc-500">No module packages in local registry yet.</p>}
          {registry.map((entry) => (
            <div key={`${entry.manifest.id}:${entry.manifest.version}`} className="flex items-center justify-between rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2">
              <div>
                <div className="text-sm text-zinc-200">
                  {entry.manifest.name} <span className="text-zinc-500">({entry.manifest.id})</span>
                </div>
                <div className="text-xs text-zinc-500">registry - v{entry.manifest.version}</div>
              </div>
              <Button
                size="sm"
                onClick={() => void install(entry.manifest.id, entry.manifest.version)}
                disabled={busyAction === "install"}
              >
                {entry.installed ? "Update" : "Install"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <Upload className="h-4 w-4" /> Import Module Package
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='Paste "module-package.json" contents here'
            className="min-h-40 font-mono text-xs"
          />
          <div className="flex items-center gap-2">
            <Button onClick={() => void importModule()} disabled={busyAction === "import" || !importJson.trim()}>
              Import + Install
            </Button>
            <Button variant="outline" onClick={() => setImportJson("")}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Exported Package</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={exportedPackage} readOnly className="min-h-40 font-mono text-xs" />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigator.clipboard.writeText(exportedPackage || "").then(() => toast.success("Copied package JSON"))}
              disabled={!exportedPackage}
            >
              Copy JSON
            </Button>
            <Button variant="outline" onClick={() => void refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
