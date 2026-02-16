"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useConfigSettings } from "@/lib/useConfigSettings";
import { X, Plus, GripVertical } from "lucide-react";

const ALL_MODELS = [
  "anthropic/claude-opus-4-6",
  "anthropic/claude-sonnet-4-20250514",
  "anthropic/claude-haiku-3-20250514",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "openai/o1",
  "openai/o3-mini",
  "google/gemini-2.0-flash",
  "google/gemini-2.0-pro",
  "deepseek/deepseek-chat",
  "deepseek/deepseek-reasoner",
  "meta-llama/llama-3.3-70b",
  "mistralai/mistral-large",
  "x-ai/grok-3",
];

export function ModelsTab() {
  const { get, set, save, saving, loading } = useConfigSettings("models.");
  const [newAlias, setNewAlias] = useState({ name: "", model: "" });
  const [newFallback, setNewFallback] = useState("");

  if (loading) return <div className="text-zinc-400">Loading...</div>;

  const allowlist = get("allowlist") ? get("allowlist").split(",") : [];
  const aliases: Record<string, string> = get("aliases") ? JSON.parse(get("aliases")) : {};
  const fallbacks = get("fallback_chain") ? get("fallback_chain").split(",") : [];
  const imageModel = get("image_model", "");
  const thinkingLevel = get("thinking_level", "off");

  const toggleModel = (model: string) => {
    const updated = allowlist.includes(model)
      ? allowlist.filter((m: string) => m !== model)
      : [...allowlist, model];
    set("allowlist", updated.join(","));
  };

  const addAlias = () => {
    if (!newAlias.name || !newAlias.model) return;
    const updated = { ...aliases, [newAlias.name]: newAlias.model };
    set("aliases", JSON.stringify(updated));
    setNewAlias({ name: "", model: "" });
  };

  const removeAlias = (name: string) => {
    const updated = { ...aliases };
    delete updated[name];
    set("aliases", JSON.stringify(updated));
  };

  const addFallback = () => {
    if (!newFallback) return;
    set("fallback_chain", [...fallbacks, newFallback].join(","));
    setNewFallback("");
  };

  const removeFallback = (idx: number) => {
    set("fallback_chain", fallbacks.filter((_: any, i: number) => i !== idx).join(","));
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Models<HelpTooltip title="Models" content="Configure which AI models are available. Set default models, temperature, max tokens, and per-model pricing for budget tracking." /></h2>
        <p className="text-sm text-zinc-400">Configure model catalog, aliases, fallbacks, and defaults.</p>
      </div>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Model Allowlist</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500 mb-3">Select which models appear in the /model command.</p>
          <div className="flex flex-wrap gap-2">
            {ALL_MODELS.map((m) => (
              <Badge
                key={m}
                variant={allowlist.includes(m) ? "default" : "outline"}
                className={`cursor-pointer transition-colors ${
                  allowlist.includes(m)
                    ? "bg-blue-600/20 text-blue-400 border-blue-600/40 hover:bg-blue-600/30"
                    : "border-white/[0.08] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.10]"
                }`}
                onClick={() => toggleModel(m)}
              >
                {m.split("/").pop()}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Model Aliases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-500">Short names that map to full model identifiers.</p>
          {Object.entries(aliases).map(([name, model]) => (
            <div key={name} className="flex items-center gap-2 bg-white/[0.06] rounded-md px-3 py-2">
              <code className="text-blue-400 text-sm">{name}</code>
              <span className="text-zinc-600">-&gt;</span>
              <span className="text-sm text-zinc-300 flex-1">{model as string}</span>
              <button onClick={() => removeAlias(name)} className="text-zinc-500 hover:text-red-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              placeholder="Alias (e.g. opus)"
              value={newAlias.name}
              onChange={(e) => setNewAlias(a => ({ ...a, name: e.target.value }))}
              className="bg-white/[0.06] border-white/[0.08] text-white text-sm flex-1"
            />
            <Input
              placeholder="Model ID"
              value={newAlias.model}
              onChange={(e) => setNewAlias(a => ({ ...a, model: e.target.value }))}
              className="bg-white/[0.06] border-white/[0.08] text-white text-sm flex-1"
            />
            <Button onClick={addAlias} size="sm" variant="outline" className="border-white/[0.08] text-zinc-300">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Fallback Chain</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-500">Ordered list of models to try if the primary fails.</p>
          {fallbacks.map((m: string, i: number) => (
            <div key={i} className="flex items-center gap-2 bg-white/[0.06] rounded-md px-3 py-2">
              <GripVertical className="w-4 h-4 text-zinc-600" />
              <span className="text-sm text-zinc-300 flex-1">{m}</span>
              <button onClick={() => removeFallback(i)} className="text-zinc-500 hover:text-red-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Select value={newFallback} onValueChange={(val) => setNewFallback(val)}>
              <SelectTrigger className="flex-1 bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select model..." />
              </SelectTrigger>
              <SelectContent>
                {ALL_MODELS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={addFallback} size="sm" variant="outline" className="border-white/[0.08] text-zinc-300">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Image Model</label>
            <Select value={imageModel || "___primary___"} onValueChange={(val) => set("image_model", val === "___primary___" ? "" : val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Same as primary" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="___primary___">Same as primary</SelectItem>
                {ALL_MODELS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Default Thinking Level</label>
            <Select value={thinkingLevel} onValueChange={(val) => set("thinking_level", val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
import { HelpTooltip } from "@/components/HelpTooltip";
