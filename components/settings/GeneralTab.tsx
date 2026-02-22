"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVIDERS } from "@/lib/providers";
import { useFetch } from "@/lib/hooks";
import { useConfigSettings } from "@/lib/useConfigSettings";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { parseProviderProfiles, pickDefaultProfileId } from "@/lib/aiRoutingConfig";

const COMMON_EMOJIS = ["🤖", "🧠", "⚡", "🔮", "🎯", "🌟", "💎", "🦊", "🐙", "👾", "🚀", "🔥", "💡", "🎭", "🌀", "✨"];

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Moscow",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul",
  "Australia/Sydney", "Pacific/Auckland",
];

export function GeneralTab() {
  const { data: agents, refetch } = useFetch<any[]>("/api/agents");
  const { data: configData } = useFetch<Record<string, string>>("/api/config/all");
  const { get, set, save: saveConfig, saving: savingConfig } = useConfigSettings("identity.");

  const agent = agents?.[0];
  const providerProfiles = parseProviderProfiles(configData?.["ai.provider_profiles"]);
  const preferredProfileId = configData?.["ai.default_profile_id"] || "";
  const activeProfileId = pickDefaultProfileId(providerProfiles, preferredProfileId) || "";
  const activeProfile = providerProfiles.find((p) => p.id === activeProfileId) || null;
  const modelsEndpoint = activeProfileId
    ? `/api/config/models?profileId=${encodeURIComponent(activeProfileId)}`
    : "/api/config/models";
  const { data: modelsData } = useFetch<{ models: string[]; provider: string }>(modelsEndpoint);
  const currentProvider = activeProfile?.provider || configData?.ai_provider || "anthropic";
  const provider = PROVIDERS.find((p) => p.slug === currentProvider);
  const profileDefaultModel = activeProfile?.defaultModel || "";
  const models = modelsData?.models?.length
    ? modelsData.models
    : (provider?.models || [profileDefaultModel || "claude-sonnet-4-20250514"]).filter(Boolean);

  const [form, setForm] = useState({
    name: "Synapse",
    systemPrompt: "You are a helpful AI assistant.",
    model: models[0],
    temperature: 0.7,
    maxTokens: 4096,
  });
  const [saving, setSaving] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    if (agent) {
      setForm({
        name: agent.name || "Synapse",
        systemPrompt: agent.systemPrompt || "You are a helpful AI assistant.",
        model: agent.model || models[0],
        temperature: agent.temperature ?? 0.7,
        maxTokens: agent.maxTokens ?? 4096,
      });
    }
  }, [agent]);

  const save = async () => {
    if (!agent) return;
    setSaving(true);
    try {
      const res = await gatewayFetch("/api/settings/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agent._id, ...form }),
      });
      if (!res.ok) throw new Error("Failed to save");
      await saveConfig();
      toast.success("Settings saved");
      refetch();
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const emoji = get("emoji", "🤖");
  const themeDesc = get("description");
  const timezone = get("timezone", "UTC");
  const timeFormat = get("time_format", "auto");
  const workspace = get("workspace_path");
  const bootstrapEnabled = get("bootstrap_enabled", "true");

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">General</h2>
        <p className="text-sm text-zinc-400">Configure your agent&apos;s identity, workspace, and behavior.</p>
      </div>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Agent Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-2xl hover:ring-2 hover:ring-blue-400 transition-all"
              >
                {emoji}
              </button>
              {showEmojiPicker && (
                <div className="absolute top-18 left-0 z-50 bg-white/[0.06] border border-white/[0.08] rounded-lg p-2 grid grid-cols-8 gap-1 shadow-xl">
                  {COMMON_EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => { set("emoji", e); setShowEmojiPicker(false); }}
                      className="w-8 h-8 flex items-center justify-center hover:bg-white/[0.10] rounded text-lg"
                    >
                      {e}
                    </button>
                  ))}
                  <div className="col-span-8 pt-1 border-t border-white/[0.08] mt-1">
                    <Input
                      placeholder="Custom emoji..."
                      className="bg-white/[0.04] border-white/[0.10] text-white text-sm h-8"
                      onChange={(e) => { if (e.target.value) { set("emoji", e.target.value); setShowEmojiPicker(false); } }}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Agent Name</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="bg-white/[0.06] border-white/[0.08] text-white"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Description / Theme</label>
                <Input
                  value={themeDesc}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="e.g. A witty AI assistant with dry humor"
                  className="bg-white/[0.06] border-white/[0.08] text-white"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Avatar</label>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <span className="text-white text-lg">{emoji}</span>
              </div>
              <Button variant="outline" className="border-white/[0.08] text-zinc-300" disabled>
                Upload (coming soon)
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">System Prompt</label>
            <Textarea
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              rows={5}
              className="bg-white/[0.06] border-white/[0.08] text-white resize-none"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Workspace Path</label>
            <Input
              value={workspace}
              onChange={(e) => set("workspace_path", e.target.value)}
              placeholder="/root/clawd"
              className="bg-white/[0.06] border-white/[0.08] text-white font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Timezone</label>
              <Select value={timezone} onValueChange={(val) => set("timezone", val)}>
                <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Time Format</label>
              <Select value={timeFormat} onValueChange={(val) => set("time_format", val)}>
                <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (system)</SelectItem>
                  <SelectItem value="12">12-hour</SelectItem>
                  <SelectItem value="24">24-hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Toggle
            checked={bootstrapEnabled === "true"}
            onChange={(v) => set("bootstrap_enabled", v ? "true" : "false")}
            label="Enable bootstrap file (BOOTSTRAP.md)"
          />
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Model Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Default Model</label>
            <Select value={form.model} onValueChange={(val) => setForm((f) => ({ ...f, model: val }))}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Temperature ({form.temperature})</label>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={form.temperature}
              onChange={(v) => setForm((f) => ({ ...f, temperature: v }))}
            />
            <div className="flex justify-between text-xs text-zinc-600 mt-1">
              <span>Precise (0)</span>
              <span>Creative (1)</span>
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Max Tokens ({form.maxTokens.toLocaleString()})</label>
            <Slider
              min={256}
              max={16384}
              step={256}
              value={form.maxTokens}
              onChange={(v) => setForm((f) => ({ ...f, maxTokens: v }))}
            />
            <div className="flex justify-between text-xs text-zinc-600 mt-1">
              <span>256</span>
              <span>16,384</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>

      <PresenceSettings />
    </div>
  );
}

function PresenceSettings() {
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("08:00");
  const [timezone, setTimezone] = useState("UTC");
  const [saving, setSaving] = useState(false);
  const [topics, setTopics] = useState<any[]>([]);
  const [newTopic, setNewTopic] = useState("");

  useEffect(() => {
    gatewayFetch("/api/presence").then((r) => r.json()).then((data) => {
      if (data.quietHoursStart) setQuietStart(data.quietHoursStart);
      if (data.quietHoursEnd) setQuietEnd(data.quietHoursEnd);
      if (data.timezone) setTimezone(data.timezone);
    }).catch(() => {});
    gatewayFetch("/api/topics").then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setTopics(data);
    }).catch(() => {});
  }, []);

  const saveQuietHours = async () => {
    setSaving(true);
    try {
      await gatewayFetch("/api/presence", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quietHoursStart: quietStart, quietHoursEnd: quietEnd, timezone }),
      });
      toast.success("Quiet hours saved");
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  const addTopic = async () => {
    if (!newTopic.trim()) return;
    await gatewayFetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTopic, category: "default" }),
    });
    setNewTopic("");
    const res = await gatewayFetch("/api/topics");
    if (res.ok) setTopics(await res.json());
  };

  const updateTopicWeight = async (id: string, personalWeight: number) => {
    setTopics((prev) => prev.map((tp) => tp._id === id ? { ...tp, personalWeight } : tp));
    try {
      await gatewayFetch("/api/topics", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, personalWeight }),
      });
    } catch {}
  };

  return (
    <>
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Quiet Hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Start</label>
              <Input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} className="bg-white/[0.06] border-white/[0.08] text-white" />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">End</label>
              <Input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} className="bg-white/[0.06] border-white/[0.08] text-white" />
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Timezone</label>
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="bg-white/[0.06] border-white/[0.08] text-white" placeholder="e.g. America/New_York" />
          </div>
          <Button onClick={saveQuietHours} disabled={saving} size="sm">
            {saving ? "Saving..." : "Save Quiet Hours"}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Active Topics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {topics.map((t: any) => (
            <div key={t._id} className="flex items-center justify-between bg-white/[0.06] rounded-md px-3 py-2">
              <div>
                <span className="text-sm text-white">{t.name}</span>
                <span className="text-xs text-zinc-500 ml-2">({t.category})</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-500">Weight</label>
                <Slider
                  min={0} max={1} step={0.1}
                  value={t.personalWeight}
                  onChange={(weight) => updateTopicWeight(t._id, weight)}
                  className="w-20"
                />
                <span className="text-xs text-zinc-400 w-6">{t.personalWeight.toFixed(1)}</span>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              placeholder="New topic..."
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTopic()}
              className="bg-white/[0.06] border-white/[0.08] text-white text-sm"
            />
            <Button onClick={addTopic} size="sm" variant="outline" className="border-white/[0.08] text-zinc-300">Add</Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
