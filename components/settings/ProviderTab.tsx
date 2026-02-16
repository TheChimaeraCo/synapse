"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PROVIDERS, type AnthropicAuthMethod } from "@/lib/providers";
import { useFetch } from "@/lib/hooks";
import { HelpTooltip } from "@/components/HelpTooltip";

export function ProviderTab() {
  const { data: configData, refetch } = useFetch<Record<string, string>>("/api/config/all");

  const currentProvider = configData?.ai_provider || "";
  const currentModel = configData?.ai_model || "";
  const provider = PROVIDERS.find((p) => p.slug === currentProvider);

  const [changing, setChanging] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(currentProvider);
  const [anthropicAuthMethod, setAnthropicAuthMethod] = useState<AnthropicAuthMethod>("api_key");
  const [authValues, setAuthValues] = useState<Record<string, string>>({});
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleTest = async () => {
    const key = authValues["api_key"] || authValues["setup_token"] || "";
    if (!key) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await gatewayFetch("/api/config/test-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey: key,
          baseUrl: authValues["base_url"],
          authMethod: anthropicAuthMethod === "setup_token" ? "setup_token" : undefined,
        }),
      });
      const result = await res.json();
      setTestResult(result.valid);
      if (!result.valid) toast.error(result.error || "Invalid credentials");
      else toast.success("Connection successful!");
    } catch {
      setTestResult(false);
      toast.error("Failed to test connection");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const key = authValues["api_key"] || authValues["setup_token"] || "";
    if (!key) { toast.error("Enter credentials first"); return; }
    setSaving(true);
    try {
      const saves: [string, string][] = [
        ["ai_provider", selectedProvider],
        ["ai_api_key", key],
      ];
      if (selectedProvider === "anthropic") {
        saves.push(["ai_auth_method", anthropicAuthMethod]);
        saves.push(["anthropic_api_key", key]);
      }
      if (authValues["base_url"]) saves.push(["ai_base_url", authValues["base_url"]]);
      if (authValues["account_id"]) saves.push(["ai_account_id", authValues["account_id"]]);

      for (const [k, v] of saves) {
        const res = await gatewayFetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: k, value: v }),
        });
        if (!res.ok) throw new Error("Failed to save");
      }
      toast.success("Provider updated");
      setChanging(false);
      refetch();
    } catch {
      toast.error("Failed to save provider");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">AI Provider<HelpTooltip title="AI Provider" content="Configure which AI service powers your gateway. Supports OpenAI, Anthropic, Google, and OpenRouter. Your API key is stored locally and never shared." /></h2>
        <p className="text-sm text-zinc-400">Manage your AI provider and API credentials.</p>
      </div>

      {/* Current provider */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Current Provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">{provider?.name || currentProvider || "Not configured"}</p>
              <p className="text-zinc-500 text-sm">{currentModel || provider?.defaultModel || "No model set"}</p>
            </div>
            {currentProvider && (
              <Badge className="bg-green-900 text-green-300">Active</Badge>
            )}
          </div>
          {!changing && (
            <Button
              variant="outline"
              onClick={() => { setChanging(true); setSelectedProvider(currentProvider); setAuthValues({}); setTestResult(null); }}
              className="border-white/[0.08] text-zinc-300"
            >
              Change Provider
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Change provider */}
      {changing && (
        <>
          <Card className="bg-white/[0.04] border-white/[0.06]">
            <CardHeader>
              <CardTitle className="text-sm text-zinc-300">Select Provider</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="max-h-[300px] overflow-y-auto space-y-1">
                {PROVIDERS.map((p) => (
                  <label
                    key={p.slug}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedProvider === p.slug
                        ? "bg-blue-950 border border-blue-700"
                        : "bg-white/[0.04] border border-transparent hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border transition-all duration-150 flex items-center justify-center shrink-0 ${
                      selectedProvider === p.slug
                        ? "border-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.2)]"
                        : "bg-white/[0.04] border-white/[0.12]"
                    }`} onClick={() => { setSelectedProvider(p.slug); setAuthValues({}); setTestResult(null); }}>
                      {selectedProvider === p.slug && <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium">{p.name}</span>
                        {p.recommended && <Badge className="bg-blue-900 text-blue-300 text-[10px] px-1.5 py-0">recommended</Badge>}
                      </div>
                      {p.description && <p className="text-zinc-500 text-xs">{p.description}</p>}
                    </div>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedProvider && (() => {
            const prov = PROVIDERS.find((p) => p.slug === selectedProvider);
            if (!prov) return null;
            const isAnthropic = prov.slug === "anthropic";
            const fields = isAnthropic && anthropicAuthMethod === "setup_token"
              ? [{ key: "setup_token", label: "Setup Token", type: "password" as const, required: true, helpText: 'Run "claude setup-token" in another terminal' }]
              : prov.authFields;

            return (
              <Card className="bg-white/[0.04] border-white/[0.06]">
                <CardHeader>
                  <CardTitle className="text-sm text-zinc-300">Credentials</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isAnthropic && (
                    <div className="flex gap-2">
                      <button onClick={() => { setAnthropicAuthMethod("api_key"); setAuthValues({}); }} className={`flex-1 text-sm py-1.5 px-3 rounded-md ${anthropicAuthMethod === "api_key" ? "bg-blue-900 text-blue-300 border border-blue-700" : "bg-white/[0.06] text-zinc-400 border border-white/[0.08]"}`}>API Key</button>
                      <button onClick={() => { setAnthropicAuthMethod("setup_token"); setAuthValues({}); }} className={`flex-1 text-sm py-1.5 px-3 rounded-md ${anthropicAuthMethod === "setup_token" ? "bg-blue-900 text-blue-300 border border-blue-700" : "bg-white/[0.06] text-zinc-400 border border-white/[0.08]"}`}>Setup Token</button>
                    </div>
                  )}
                  {fields.map((field) => (
                    <div key={field.key}>
                      <label className="text-sm text-zinc-400 mb-1 block">{field.label}</label>
                      <div className="relative">
                        <Input
                          type={field.type === "password" && !showFields[field.key] ? "password" : "text"}
                          value={authValues[field.key] || ""}
                          onChange={(e) => { setAuthValues((prev) => ({ ...prev, [field.key]: e.target.value })); setTestResult(null); }}
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
                  <div className="flex gap-2 items-center">
                    <Button variant="outline" onClick={handleTest} disabled={testing || !(authValues["api_key"] || authValues["setup_token"])} className="border-white/[0.08] text-zinc-300">
                      {testing ? "Testing..." : "Test Connection"}
                    </Button>
                    {testResult === true && <Badge className="bg-green-900 text-green-300">Valid</Badge>}
                    {testResult === false && <Badge className="bg-red-900 text-red-300">Invalid</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setChanging(false)} className="border-white/[0.08] text-zinc-300">Cancel</Button>
                    <Button onClick={handleSave} disabled={saving || !(authValues["api_key"] || authValues["setup_token"])} className="flex-1">
                      {saving ? "Saving..." : "Save Provider"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}
    </div>
  );
}
