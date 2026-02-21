"use client";

import { useState, useEffect, useCallback } from "react";
import { useFetch } from "@/lib/hooks";
import { useRouter } from "next/navigation";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PROVIDERS, type AnthropicAuthMethod } from "@/lib/providers";
import { InfoTooltip } from "@/components/ui/Tooltip";

type Step = 1 | 2 | 3 | 4;

const CACHE_KEY = "synapse-setup-state";

interface SetupCache {
  step: Step;
  name: string;
  email: string;
  gatewayName: string;
  gatewaySlug: string;
  gatewayDesc: string;
  gatewayIcon: string;
  gatewayWorkspace: string;
  slugEdited: boolean;
  selectedProvider: string;
  providerPhase: "select" | "auth";
  anthropicAuthMethod: AnthropicAuthMethod;
  authValues: Record<string, string>;
  botToken: string;
  createdGatewayId: string | null;
  timestamp: number;
}

function loadCache(): Partial<SetupCache> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SetupCache;
    // Expire cache after 1 hour
    if (Date.now() - data.timestamp > 3600000) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveCache(state: Partial<SetupCache>) {
  try {
    const existing = loadCache() || {};
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...existing, ...state, timestamp: Date.now() }));
  } catch {}
}

function clearCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}

export default function SetupPage() {
  const router = useRouter();
  const { data: setupData } = useFetch<{ complete: boolean }>("/api/config/setup-complete");

  // Load cached state
  const [initialized, setInitialized] = useState(false);
  const cached = typeof window !== "undefined" ? loadCache() : null;

  const [step, setStep] = useState<Step>((cached?.step as Step) || 1);
  const [loading, setLoading] = useState(false);

  // Step 1 - Account
  const [name, setName] = useState(cached?.name || "");
  const [email, setEmail] = useState(cached?.email || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Step 2 - Gateway
  const [gatewayName, setGatewayName] = useState(cached?.gatewayName || "");
  const [gatewaySlug, setGatewaySlug] = useState(cached?.gatewaySlug || "");
  const [gatewayDesc, setGatewayDesc] = useState(cached?.gatewayDesc || "");
  const [gatewayIcon, setGatewayIcon] = useState(cached?.gatewayIcon || "");
  const [gatewayWorkspace, setGatewayWorkspace] = useState(cached?.gatewayWorkspace || "");
  const [slugEdited, setSlugEdited] = useState(cached?.slugEdited || false);

  // Step 3 - Provider
  const [selectedProvider, setSelectedProvider] = useState<string>(cached?.selectedProvider || "anthropic");
  const [providerPhase, setProviderPhase] = useState<"select" | "auth">(cached?.providerPhase || "select");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [anthropicAuthMethod, setAnthropicAuthMethod] = useState<AnthropicAuthMethod>(cached?.anthropicAuthMethod || "api_key");
  const [authValues, setAuthValues] = useState<Record<string, string>>(cached?.authValues || {});
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});
  const [apiKeyValid, setApiKeyValid] = useState<boolean | null>(null);
  const [testUnverified, setTestUnverified] = useState(false);

  // Step 4 - Telegram
  const [botToken, setBotToken] = useState(cached?.botToken || "");
  const [showBotToken, setShowBotToken] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [telegramValid, setTelegramValid] = useState<boolean | null>(null);

  // Track created gateway for config saves
  const [createdGatewayId, setCreatedGatewayId] = useState<string | null>(cached?.createdGatewayId || null);

  // Mark initialized after first render (prevents hydration mismatch)
  useEffect(() => { setInitialized(true); }, []);

  // Persist state to localStorage on every change
  useEffect(() => {
    if (!initialized) return;
    saveCache({
      step, name, email, gatewayName, gatewaySlug, gatewayDesc, gatewayIcon,
      gatewayWorkspace, slugEdited, selectedProvider, providerPhase,
      anthropicAuthMethod, authValues, botToken, createdGatewayId,
    });
  }, [initialized, step, name, email, gatewayName, gatewaySlug, gatewayDesc, gatewayIcon,
      gatewayWorkspace, slugEdited, selectedProvider, providerPhase,
      anthropicAuthMethod, authValues, botToken, createdGatewayId]);

  useEffect(() => {
    if (setupData?.complete === true) {
      clearCache();
      router.replace("/chat");
    }
  }, [setupData, router]);

  // Prevent accidental navigation/refresh during setup
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (step > 1) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [step]);

  // Auto-generate slug from gateway name
  const handleGatewayNameChange = (val: string) => {
    setGatewayName(val);
    if (!slugEdited) {
      const slug = val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      setGatewaySlug(slug);
      setGatewayWorkspace(`/root/synapse/gateways/${slug}/`);
    }
  };

  if (setupData === undefined) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (setupData?.complete === true) return null;

  const handleCreateAccount = async () => {
    if (!name || !email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await gatewayFetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name, isSetup: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          const signInRes = await signIn("credentials", { email, password, redirect: false });
          if (signInRes?.error) {
            toast.error("Account exists but password doesn't match.");
            return;
          }
          setStep(2);
          return;
        }
        toast.error(data.error || "Registration failed");
        return;
      }
      const signInRes = await signIn("credentials", { email, password, redirect: false });
      if (signInRes?.error) {
        toast.error("Account created but auto-login failed. Please log in manually.");
        return;
      }
      setStep(2);
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGateway = async () => {
    if (!gatewayName.trim() || !gatewaySlug.trim()) {
      toast.error("Gateway name and slug are required");
      return;
    }
    setLoading(true);
    try {
      const res = await gatewayFetch("/api/setup/create-gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: gatewayName.trim(),
          slug: gatewaySlug.trim(),
          description: gatewayDesc.trim() || undefined,
          icon: gatewayIcon.trim() || undefined,
          workspacePath: gatewayWorkspace.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create gateway");
        return;
      }
      setCreatedGatewayId(data.gatewayId);
      localStorage.setItem("synapse-active-gateway", data.gatewayId);
      document.cookie = `synapse-active-gateway=${data.gatewayId}; path=/; max-age=31536000; samesite=lax`;
      setStep(3);
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const saveGatewayConfig = async (key: string, value: string) => {
    if (!createdGatewayId) return;
    const res = await gatewayFetch("/api/setup/save-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gatewayId: createdGatewayId, key, value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`Failed to save config "${key}":`, data);
    }
  };

  const handleTestProvider = async () => {
    const key = authValues["api_key"] || authValues["setup_token"] || "";
    if (!key) return;
    setLoading(true);
    setApiKeyValid(null);
    setTestUnverified(false);
    try {
      const res = await gatewayFetch("/api/config/test-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey: key,
          baseUrl: authValues["base_url"],
          authMethod: selectedProvider === "anthropic" ? anthropicAuthMethod : undefined,
        }),
      });
      const result = await res.json();
      setApiKeyValid(result.valid);
      setTestUnverified(!!result.unverified);
      if (!result.valid) toast.error(result.error || "Invalid credentials");
    } catch {
      setApiKeyValid(false);
      toast.error("Failed to test connection");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProvider = async () => {
    if (selectedProvider === "skip") {
      setStep(4);
      return;
    }
    const key = authValues["api_key"] || authValues["setup_token"] || "";
    if (!key) {
      toast.error("Please enter your credentials");
      return;
    }
    setLoading(true);
    try {
      let effectiveKey = key;
      if (selectedProvider === "anthropic" && anthropicAuthMethod === "setup_token") {
        const exchangeRes = await gatewayFetch("/api/config/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "anthropic", token: key }),
        });
        const exchangeResult = await exchangeRes.json();
        if (!exchangeResult.success) {
          toast.error(exchangeResult.error || "Failed to validate setup token");
          setLoading(false);
          return;
        }
        effectiveKey = exchangeResult.accessToken;
      }

      const saves: [string, string][] = [
        ["ai_provider", selectedProvider],
        ["ai_api_key", effectiveKey],
      ];
      if (selectedProvider === "anthropic") {
        saves.push(["ai_auth_method", anthropicAuthMethod]);
        saves.push(["anthropic_api_key", effectiveKey]);
      }
      // Save selected model (or provider default)
      const provider = PROVIDERS.find((p) => p.slug === selectedProvider);
      const model = selectedModel || provider?.defaultModel || "";
      if (model) {
        saves.push(["ai_model", model]);
      }
      if (authValues["base_url"]) saves.push(["ai_base_url", authValues["base_url"]]);
      if (authValues["account_id"]) saves.push(["ai_account_id", authValues["account_id"]]);

      for (const [k, v] of saves) {
        await saveGatewayConfig(k, v);
      }
      setStep(4);
    } catch {
      toast.error("Failed to save provider config");
    } finally {
      setLoading(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!botToken) return;
    setLoading(true);
    setTelegramValid(null);
    setBotUsername(null);
    try {
      const res = await gatewayFetch("/api/config/test-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken }),
      });
      const result = await res.json();
      setTelegramValid(result.valid);
      if (result.valid && result.botUsername) {
        setBotUsername(result.botUsername);
      } else {
        toast.error(result.error || "Invalid token");
      }
    } catch {
      setTelegramValid(false);
      toast.error("Failed to test token");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      if (botToken && telegramValid) {
        await saveGatewayConfig("telegram_bot_token", botToken);
      }

      if (name) {
        await saveGatewayConfig("owner_name", name);
      }

      // Create default agent and channels
      if (createdGatewayId) {
        try {
          const initRes = await gatewayFetch("/api/setup/initialize", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Gateway-Id": createdGatewayId,
            },
            body: JSON.stringify({
              gatewayId: createdGatewayId,
              hasTelegram: !!(botToken && telegramValid),
            }),
          });
          if (!initRes.ok) {
            console.warn("Setup initialize failed:", await initRes.text());
          }
        } catch (e) {
          console.warn("Setup initialize error:", e);
        }
      }

      // Verify gateway exists before completing
      if (createdGatewayId) {
        try {
          const verifyRes = await gatewayFetch("/api/gateways", {
            headers: { "X-Gateway-Id": createdGatewayId },
          });
          const verifyData = await verifyRes.json();
          const found = verifyData.gateways?.some((g: any) => g._id === createdGatewayId);
          if (!found) {
            toast.error("Gateway not found. Please try creating it again.");
            setStep(2);
            return;
          }
        } catch (e) {
          console.warn("Gateway verify failed, continuing anyway:", e);
        }
      }

      await gatewayFetch("/api/config/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "setup_complete", value: "true" }),
      });

      // Set cookie so middleware knows setup is done
      document.cookie = "synapse-setup-complete=true; path=/; max-age=86400; samesite=lax";

      clearCache();
      router.push("/onboarding");
    } catch {
      toast.error("Failed to complete setup");
    } finally {
      setLoading(false);
    }
  };

  const stepTitles = ["Create Account", "Create Gateway", "AI Provider", "Connect Telegram"];

  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-start pt-12 sm:justify-center sm:pt-0 px-4 pb-8 overflow-y-auto">
      {/* Header */}
      <div className="mb-6 text-center shrink-0">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-bold text-lg">S</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Synapse</h1>
        </div>
        <p className="text-zinc-500 text-sm">Step {step} of 4 - {stepTitles[step - 1]}</p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-md mb-6 flex gap-2 shrink-0">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-blue-500" : "bg-white/[0.08]"
            }`}
          />
        ))}
      </div>

      {/* Step 1: Create Account */}
      {step === 1 && (
        <div className="w-full max-w-md bg-white/[0.07] backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-200 mb-1">Welcome to Synapse</h2>
          <p className="text-sm text-zinc-400 mb-6">Create your owner account to get started.</p>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
                className="bg-white/[0.04] border-white/10 text-zinc-200 placeholder-zinc-600 rounded-xl" />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                className="bg-white/[0.04] border-white/10 text-zinc-200 placeholder-zinc-600 rounded-xl" />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Password</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters"
                className="bg-white/[0.04] border-white/10 text-zinc-200 placeholder-zinc-600 rounded-xl" />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Confirm Password</label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password"
                className="bg-white/[0.04] border-white/10 text-zinc-200 placeholder-zinc-600 rounded-xl" />
            </div>
            <Button onClick={handleCreateAccount} disabled={loading} className="w-full">
              {loading ? "Creating..." : "Create Account"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Create Gateway */}
      {step === 2 && (
        <div className="w-full max-w-md bg-white/[0.07] backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-200 mb-1">Create Your First Gateway</h2>
          <p className="text-sm text-zinc-400 mb-6">A gateway is an isolated workspace for your AI agent.</p>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Gateway Name *<InfoTooltip text="A friendly name for this gateway. Each gateway is an isolated workspace with its own agent, config, and data." /></label>
              <Input value={gatewayName} onChange={(e) => handleGatewayNameChange(e.target.value)} placeholder='e.g. "Personal", "My Company"'
                className="bg-white/[0.04] border-white/10 text-zinc-200 placeholder-zinc-600 rounded-xl" autoFocus />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Slug<InfoTooltip text="URL-safe identifier used in paths and APIs. Auto-generated from the name. Only lowercase letters, numbers, and hyphens." /></label>
              <Input value={gatewaySlug}
                onChange={(e) => { setGatewaySlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "")); setSlugEdited(true); }}
                placeholder="my-gateway"
                className="bg-white/[0.04] border-white/10 text-zinc-200 placeholder-zinc-600 rounded-xl font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Icon (emoji)</label>
                <Input value={gatewayIcon} onChange={(e) => setGatewayIcon(e.target.value)} placeholder="🤖"
                  className="bg-white/[0.04] border-white/10 text-zinc-200 placeholder-zinc-600 rounded-xl" />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Description</label>
                <Input value={gatewayDesc} onChange={(e) => setGatewayDesc(e.target.value)} placeholder="Optional"
                  className="bg-white/[0.04] border-white/10 text-zinc-200 placeholder-zinc-600 rounded-xl" />
              </div>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Workspace Path<InfoTooltip text="Filesystem directory where this gateway stores files. Tools like file browser and shell operate within this path. Must be an absolute path on the server." /></label>
              <Input value={gatewayWorkspace} onChange={(e) => setGatewayWorkspace(e.target.value)}
                placeholder="/root/synapse/gateways/my-gateway/"
                className="bg-white/[0.04] border-white/10 text-zinc-200 placeholder-zinc-600 rounded-xl font-mono text-xs" />
              <p className="text-zinc-600 text-xs mt-1">Directory for this gateway's files and config.</p>
            </div>
            <Button onClick={handleCreateGateway} disabled={loading || !gatewayName.trim()} className="w-full">
              {loading ? "Creating..." : "Create Gateway"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: AI Provider */}
      {step === 3 && providerPhase === "select" && (
        <div className="w-full max-w-md bg-white/[0.07] backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-200 mb-1">AI Provider<InfoTooltip text="The AI service that powers your agent's responses. Anthropic (Claude) is recommended. You can change this later in settings." /></h2>
          <p className="text-sm text-zinc-400 mb-4">Select your AI provider to power the agent.</p>
          <div className="space-y-3">
            <div className="max-h-[50vh] overflow-y-auto space-y-1 pr-1 overscroll-contain">
              {PROVIDERS.map((p) => (
                <label key={p.slug}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                    selectedProvider === p.slug
                      ? "bg-gradient-to-r from-blue-500/15 to-purple-500/10 border border-blue-500/30"
                      : "bg-white/[0.04] border border-transparent hover:bg-white/10"
                  }`}>
                  <div className={`w-4 h-4 rounded-full border transition-all duration-150 flex items-center justify-center shrink-0 ${
                    selectedProvider === p.slug ? "border-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.2)]" : "bg-white/[0.04] border-white/[0.12]"
                  }`}>
                    {selectedProvider === p.slug && <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-200 text-sm font-medium">{p.name}</span>
                      {p.recommended && <Badge className="bg-blue-900 text-blue-300 text-[10px] px-1.5 py-0">recommended</Badge>}
                    </div>
                    {p.description && <p className="text-zinc-500 text-xs truncate">{p.description}</p>}
                  </div>
                </label>
              ))}
              <label className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                selectedProvider === "skip"
                  ? "bg-gradient-to-r from-blue-500/15 to-purple-500/10 border border-blue-500/30"
                  : "bg-white/[0.04] border border-transparent hover:bg-white/10"
              }`}>
                <div className={`w-4 h-4 rounded-full border transition-all duration-150 flex items-center justify-center shrink-0 ${
                  selectedProvider === "skip" ? "border-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.2)]" : "bg-white/[0.04] border-white/[0.12]"
                }`}>
                  {selectedProvider === "skip" && <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" />}
                </div>
                <div>
                  <span className="text-zinc-400 text-sm">Skip for now</span>
                  <p className="text-zinc-600 text-xs">Configure later in settings</p>
                </div>
              </label>
            </div>
            <Button onClick={() => {
              if (selectedProvider === "skip") { handleSaveProvider(); }
              else { setAuthValues({}); setShowFields({}); setApiKeyValid(null); setTestUnverified(false); setSelectedModel(""); setProviderPhase("auth"); }
            }} className="w-full">
              {selectedProvider === "skip" ? "Skip" : "Next"}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && providerPhase === "auth" && (() => {
        const provider = PROVIDERS.find((p) => p.slug === selectedProvider);
        if (!provider) return null;
        const isAnthropic = provider.slug === "anthropic";
        const fields = isAnthropic && anthropicAuthMethod === "setup_token"
          ? [{ key: "setup_token", label: "Setup Token", type: "password" as const, required: true, helpText: 'Run "claude setup-token" in another terminal, then paste the token here' }]
          : provider.authFields;

        return (
          <div className="w-full max-w-md bg-white/[0.07] backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-zinc-200 mb-1">{provider.name}</h2>
            <p className="text-sm text-zinc-400 mb-4">
              {provider.helpUrl ? (
                <>Get your credentials at{" "}
                  <a href={provider.helpUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                    {provider.helpUrl.replace(/^https?:\/\//, "")}
                  </a>
                </>
              ) : `Enter your ${provider.name} credentials`}
            </p>
            <div className="space-y-4">
              {isAnthropic && (
                <div className="flex gap-2">
                  <button onClick={() => { setAnthropicAuthMethod("api_key"); setAuthValues({}); setApiKeyValid(null); }}
                    className={`flex-1 text-sm py-1.5 px-3 rounded-xl transition-colors ${
                      anthropicAuthMethod === "api_key"
                        ? "bg-gradient-to-r from-blue-500/15 to-purple-500/10 text-blue-400 border border-blue-500/30"
                        : "bg-white/[0.04] text-zinc-400 border border-white/10"
                    }`}>API Key</button>
                  <button onClick={() => { setAnthropicAuthMethod("setup_token"); setAuthValues({}); setApiKeyValid(null); }}
                    className={`flex-1 text-sm py-1.5 px-3 rounded-xl transition-colors ${
                      anthropicAuthMethod === "setup_token"
                        ? "bg-gradient-to-r from-blue-500/15 to-purple-500/10 text-blue-400 border border-blue-500/30"
                        : "bg-white/[0.04] text-zinc-400 border border-white/10"
                    }`}>Setup Token</button>
                </div>
              )}
              {fields.map((field) => (
                <div key={field.key}>
                  <label className="text-sm text-zinc-400 mb-1 block">{field.label}</label>
                  <div className="relative">
                    <Input type={field.type === "password" && !showFields[field.key] ? "password" : "text"}
                      value={authValues[field.key] || ""}
                      onChange={(e) => { setAuthValues((prev) => ({ ...prev, [field.key]: e.target.value })); setApiKeyValid(null); setTestUnverified(false); }}
                      placeholder={field.type === "url" ? "https://..." : ""}
                      className="bg-white/[0.04] border-white/10 text-zinc-200 pr-16 rounded-xl" />
                    {field.type === "password" && (
                      <button type="button" onClick={() => setShowFields((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-white">
                        {showFields[field.key] ? "Hide" : "Show"}
                      </button>
                    )}
                  </div>
                  {field.helpText && <p className="text-zinc-600 text-xs mt-1">{field.helpText}</p>}
                </div>
              ))}
              {provider.models.length > 1 && (
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Default Model</label>
                  <select
                    value={selectedModel || provider.defaultModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/10 text-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    {provider.models.map((m) => (
                      <option key={m} value={m} className="bg-zinc-900">{m}{m === provider.defaultModel ? " (recommended)" : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-2 items-center">
                <Button variant="outline" onClick={handleTestProvider}
                  disabled={loading || !(authValues["api_key"] || authValues["setup_token"])}
                  className="border-white/10 text-zinc-300 hover:text-white rounded-xl">
                  {loading ? "Testing..." : "Test Connection"}
                </Button>
                {apiKeyValid === true && !testUnverified && <Badge className="bg-green-900 text-green-300">Valid</Badge>}
                {apiKeyValid === true && testUnverified && <Badge className="bg-yellow-900 text-yellow-300">Saved (not verified)</Badge>}
                {apiKeyValid === false && <Badge className="bg-red-900 text-red-300">Invalid</Badge>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setProviderPhase("select"); setApiKeyValid(null); }}
                  className="border-white/10 text-zinc-300 hover:text-white rounded-xl">Back</Button>
                <Button onClick={handleSaveProvider} disabled={loading || !(authValues["api_key"] || authValues["setup_token"])}
                  className="flex-1">
                  {loading ? "Saving..." : "Next"}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Step 4: Connect Telegram */}
      {step === 4 && (
        <div className="w-full max-w-md bg-white/[0.07] backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-200 mb-1">Connect Telegram</h2>
          <p className="text-sm text-zinc-400 mb-4">
            Optional. Create a bot with{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">@BotFather</a>{" "}
            on Telegram.
          </p>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Bot Token</label>
              <div className="relative">
                <Input type={showBotToken ? "text" : "password"} value={botToken}
                  onChange={(e) => { setBotToken(e.target.value); setTelegramValid(null); setBotUsername(null); }}
                  placeholder="123456:ABC-DEF..."
                  className="bg-white/[0.04] border-white/10 text-zinc-200 pr-16 rounded-xl" />
                <button type="button" onClick={() => setShowBotToken(!showBotToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-white">
                  {showBotToken ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <Button variant="outline" onClick={handleTestTelegram} disabled={loading || !botToken}
                className="border-white/10 text-zinc-300 hover:text-white rounded-xl">
                {loading ? "Testing..." : "Test Connection"}
              </Button>
              {telegramValid === true && botUsername && <Badge className="bg-green-900 text-green-300">@{botUsername}</Badge>}
              {telegramValid === false && <Badge className="bg-red-900 text-red-300">Invalid</Badge>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleComplete} disabled={loading}
                className="flex-1 border-white/10 text-zinc-300 hover:text-white rounded-xl">Skip</Button>
              <Button onClick={handleComplete} disabled={loading || !botToken || !telegramValid}
                className="flex-1">
                {loading ? "Finishing..." : "Complete Setup"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
