"use client";

import { gatewayFetch } from "@/lib/gatewayFetch";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PROVIDERS, type AnthropicAuthMethod } from "@/lib/providers";
import { useFetch } from "@/lib/hooks";
import { HelpTooltip } from "@/components/HelpTooltip";
import {
  parseProviderProfiles,
  pickDefaultProfileId,
  serializeProviderProfiles,
  type ProviderProfile,
} from "@/lib/aiRoutingConfig";

interface ProviderDraft {
  id?: string;
  name: string;
  provider: string;
  apiKey: string;
  authMethod?: string;
  baseUrl?: string;
  accountId?: string;
  defaultModel?: string;
}

function toDraft(profile: ProviderProfile): ProviderDraft {
  return {
    id: profile.id,
    name: profile.name,
    provider: profile.provider,
    apiKey: profile.apiKey || "",
    authMethod: profile.authMethod,
    baseUrl: profile.baseUrl,
    accountId: profile.accountId,
    defaultModel: profile.defaultModel,
  };
}

function newDraft(provider = "anthropic"): ProviderDraft {
  return {
    name: "",
    provider,
    apiKey: "",
    authMethod: provider === "anthropic" ? "api_key" : undefined,
    baseUrl: "",
    accountId: "",
    defaultModel: PROVIDERS.find((p) => p.slug === provider)?.defaultModel || "",
  };
}

function clean(value?: string): string {
  return (value || "").trim();
}

function normalizeProfile(profile: ProviderDraft, fallbackId: string): ProviderProfile {
  const provider = clean(profile.provider) || "anthropic";
  const defaultModel = clean(profile.defaultModel) || PROVIDERS.find((p) => p.slug === provider)?.defaultModel || "";
  return {
    id: clean(profile.id) || fallbackId,
    name: clean(profile.name) || `${provider} profile`,
    provider,
    apiKey: clean(profile.apiKey),
    authMethod: clean(profile.authMethod),
    baseUrl: clean(profile.baseUrl),
    accountId: clean(profile.accountId),
    defaultModel,
    enabled: true,
  };
}

export function ProviderTab() {
  const { data: configData, refetch } = useFetch<Record<string, string>>("/api/config/all");

  const parsedProfiles = useMemo(() => {
    const profiles = parseProviderProfiles(configData?.["ai.provider_profiles"]);
    if (profiles.length > 0) return profiles;

    const legacyProvider = configData?.ai_provider;
    const legacyModel = configData?.ai_model;
    if (!legacyProvider) return [];

    return [{
      id: "legacy-default",
      name: "Default Provider",
      provider: legacyProvider,
      apiKey: configData?.ai_api_key || "",
      authMethod: configData?.ai_auth_method || undefined,
      baseUrl: configData?.ai_base_url || undefined,
      accountId: configData?.ai_account_id || undefined,
      defaultModel: legacyModel || undefined,
      enabled: true,
    } satisfies ProviderProfile];
  }, [configData]);

  const [profiles, setProfiles] = useState<ProviderProfile[]>([]);
  const [defaultProfileId, setDefaultProfileId] = useState<string>("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProviderDraft>(newDraft());
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProfiles(parsedProfiles);
    const preferred = configData?.["ai.default_profile_id"];
    const fallbackId = pickDefaultProfileId(parsedProfiles, preferred) || parsedProfiles[0]?.id || "";
    setDefaultProfileId(fallbackId);
  }, [parsedProfiles, configData]);

  const currentProvider = profiles.find((p) => p.id === defaultProfileId) || profiles[0];
  const currentProviderDef = currentProvider ? PROVIDERS.find((p) => p.slug === currentProvider.provider) : null;
  const currentModel = currentProvider?.defaultModel || configData?.ai_model || currentProviderDef?.defaultModel || "";

  const providerDef = PROVIDERS.find((p) => p.slug === draft.provider);
  const anthropicAuthMethod = (draft.authMethod || "api_key") as AnthropicAuthMethod;
  const isAnthropic = draft.provider === "anthropic";
  const fields = isAnthropic && anthropicAuthMethod === "setup_token"
    ? [{ key: "setup_token", label: "Setup Token", type: "password" as const, required: true, helpText: 'Run "claude setup-token" in another terminal' }]
    : (providerDef?.authFields || []);

  const setDraftField = (key: string, value: string) => {
    if (key === "api_key" || key === "setup_token") setDraft((d) => ({ ...d, apiKey: value }));
    else if (key === "base_url") setDraft((d) => ({ ...d, baseUrl: value }));
    else if (key === "account_id") setDraft((d) => ({ ...d, accountId: value }));
  };

  const getDraftField = (key: string) => {
    if (key === "api_key" || key === "setup_token") return draft.apiKey || "";
    if (key === "base_url") return draft.baseUrl || "";
    if (key === "account_id") return draft.accountId || "";
    return "";
  };

  const persistProfiles = async (nextProfiles: ProviderProfile[], nextDefaultId: string) => {
    setSaving(true);
    try {
      const defaultId = nextDefaultId || pickDefaultProfileId(nextProfiles, nextDefaultId) || nextProfiles[0]?.id || "";
      const defaultProfile = nextProfiles.find((p) => p.id === defaultId) || nextProfiles[0];
      const payload: Record<string, string> = {
        "ai.provider_profiles": serializeProviderProfiles(nextProfiles),
        "ai.default_profile_id": defaultId,
      };

      if (defaultProfile) {
        payload.ai_provider = defaultProfile.provider;
        payload.ai_api_key = defaultProfile.apiKey || "";
        payload.ai_model = defaultProfile.defaultModel || PROVIDERS.find((p) => p.slug === defaultProfile.provider)?.defaultModel || "";
        payload.ai_auth_method = defaultProfile.authMethod || "";
        payload.ai_base_url = defaultProfile.baseUrl || "";
        payload.ai_account_id = defaultProfile.accountId || "";
        if (defaultProfile.provider === "anthropic" && defaultProfile.apiKey) {
          payload.anthropic_api_key = defaultProfile.apiKey;
        }
      }

      const res = await gatewayFetch("/api/config/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save profiles");

      setProfiles(nextProfiles);
      setDefaultProfileId(defaultId);
      toast.success("Provider profiles saved");
      refetch();
    } catch {
      toast.error("Failed to save provider profiles");
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    if (!clean(draft.apiKey)) {
      toast.error("Enter credentials first");
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await gatewayFetch("/api/config/test-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: draft.provider,
          apiKey: draft.apiKey,
          baseUrl: draft.baseUrl,
          authMethod: isAnthropic ? anthropicAuthMethod : undefined,
        }),
      });
      const result = await res.json();
      setTestResult(result.valid);
      if (!result.valid) toast.error(result.error || "Invalid credentials");
      else toast.success("Connection successful");
    } catch {
      setTestResult(false);
      toast.error("Failed to test connection");
    } finally {
      setTesting(false);
    }
  };

  const onSaveDraft = async () => {
    if (!clean(draft.provider) || !clean(draft.apiKey)) {
      toast.error("Provider and key are required");
      return;
    }

    const fallbackId = editingIndex !== null ? (profiles[editingIndex]?.id || "") : `${draft.provider}-${Date.now()}`;
    const normalized = normalizeProfile({
      ...draft,
      authMethod: isAnthropic ? anthropicAuthMethod : draft.authMethod,
    }, fallbackId);

    const next = [...profiles];
    if (editingIndex !== null) next[editingIndex] = normalized;
    else next.push(normalized);

    const nextDefault = defaultProfileId || normalized.id;
    await persistProfiles(next, nextDefault);

    setEditingIndex(null);
    setDraft(newDraft(draft.provider));
    setTestResult(null);
  };

  const onDeleteProfile = async (id: string) => {
    const next = profiles.filter((p) => p.id !== id);
    const nextDefault = defaultProfileId === id ? (next[0]?.id || "") : defaultProfileId;
    await persistProfiles(next, nextDefault);
  };

  const startCreate = () => {
    setEditingIndex(null);
    setDraft(newDraft(currentProvider?.provider || "anthropic"));
    setTestResult(null);
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setDraft(toDraft(profiles[index]));
    setTestResult(null);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">AI Providers<HelpTooltip title="AI Providers" content="Add multiple provider profiles and choose a default. Tool and model routing can override provider/model per capability." /></h2>
        <p className="text-sm text-zinc-400">Manage provider profiles, credentials, and default model selections.</p>
      </div>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Default Provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-white font-medium">{currentProvider ? `${currentProvider.name} (${currentProvider.provider})` : "Not configured"}</p>
            <p className="text-zinc-500 text-sm">{currentModel || "No model set"}</p>
          </div>
          <div className="space-y-2">
            {profiles.map((profile, index) => (
              <div key={profile.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium truncate">{profile.name}</span>
                    <Badge className="bg-white/10 text-zinc-300 text-[10px]">{profile.provider}</Badge>
                    {defaultProfileId === profile.id && <Badge className="bg-green-900 text-green-300 text-[10px]">default</Badge>}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">{profile.defaultModel || "no default model"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => startEdit(index)} className="border-white/[0.08] text-zinc-300">Edit</Button>
                  <Button variant="outline" size="sm" onClick={() => persistProfiles(profiles, profile.id)} disabled={saving || defaultProfileId === profile.id} className="border-white/[0.08] text-zinc-300">Set Default</Button>
                  <Button variant="outline" size="sm" onClick={() => onDeleteProfile(profile.id)} disabled={saving} className="border-red-500/40 text-red-300">Delete</Button>
                </div>
              </div>
            ))}
            {profiles.length === 0 && (
              <div className="text-sm text-zinc-500">No provider profiles configured yet.</div>
            )}
          </div>
          <Button variant="outline" onClick={startCreate} className="border-white/[0.08] text-zinc-300">Add Provider Profile</Button>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">{editingIndex !== null ? "Edit Provider Profile" : "New Provider Profile"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Profile Name</label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Anthropic Primary"
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Provider</label>
            <select
              value={draft.provider}
              onChange={(e) => {
                const nextProvider = e.target.value;
                setDraft((d) => ({
                  ...d,
                  provider: nextProvider,
                  authMethod: nextProvider === "anthropic" ? "api_key" : undefined,
                  defaultModel: PROVIDERS.find((p) => p.slug === nextProvider)?.defaultModel || "",
                }));
                setTestResult(null);
              }}
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
            >
              {PROVIDERS.map((p) => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
            </select>
          </div>

          {isAnthropic && (
            <div className="flex gap-2">
              <button onClick={() => setDraft((d) => ({ ...d, authMethod: "api_key", apiKey: "" }))} className={`flex-1 text-sm py-1.5 px-3 rounded-md ${anthropicAuthMethod === "api_key" ? "bg-blue-900 text-blue-300 border border-blue-700" : "bg-white/[0.06] text-zinc-400 border border-white/[0.08]"}`}>API Key</button>
              <button onClick={() => setDraft((d) => ({ ...d, authMethod: "setup_token", apiKey: "" }))} className={`flex-1 text-sm py-1.5 px-3 rounded-md ${anthropicAuthMethod === "setup_token" ? "bg-blue-900 text-blue-300 border border-blue-700" : "bg-white/[0.06] text-zinc-400 border border-white/[0.08]"}`}>Setup Token</button>
            </div>
          )}

          {fields.map((field) => (
            <div key={field.key}>
              <label className="text-sm text-zinc-400 mb-1 block">{field.label}</label>
              <div className="relative">
                <Input
                  type={field.type === "password" && !showFields[field.key] ? "password" : "text"}
                  value={getDraftField(field.key)}
                  onChange={(e) => { setDraftField(field.key, e.target.value); setTestResult(null); }}
                  className="bg-white/[0.06] border-white/[0.08] text-white pr-16"
                />
                {field.type === "password" && (
                  <button type="button" onClick={() => setShowFields((prev) => ({ ...prev, [field.key]: !prev[field.key] }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-white">
                    {showFields[field.key] ? "Hide" : "Show"}
                  </button>
                )}
              </div>
              {field.helpText && <p className="text-zinc-600 text-xs mt-1">{field.helpText}</p>}
            </div>
          ))}

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Default Model (for this profile)</label>
            <Input
              value={draft.defaultModel || ""}
              onChange={(e) => setDraft((d) => ({ ...d, defaultModel: e.target.value }))}
              placeholder={providerDef?.defaultModel || "Model ID"}
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>

          <div className="flex gap-2 items-center">
            <Button variant="outline" onClick={onTest} disabled={testing || !clean(draft.apiKey)} className="border-white/[0.08] text-zinc-300">
              {testing ? "Testing..." : "Test Connection"}
            </Button>
            {testResult === true && <Badge className="bg-green-900 text-green-300">Valid</Badge>}
            {testResult === false && <Badge className="bg-red-900 text-red-300">Invalid</Badge>}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={startCreate} className="border-white/[0.08] text-zinc-300">Reset</Button>
            <Button onClick={onSaveDraft} disabled={saving || !clean(draft.apiKey)} className="flex-1">
              {saving ? "Saving..." : (editingIndex !== null ? "Update Profile" : "Save Profile")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
