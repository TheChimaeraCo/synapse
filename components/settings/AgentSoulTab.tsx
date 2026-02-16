"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFetch } from "@/lib/hooks";
import { Slider } from "@/components/ui/slider";
import { Eye, Save, RefreshCw, Sparkles, BookTemplate, Check } from "lucide-react";
import { PROMPT_TEMPLATES, type PromptTemplate } from "@/lib/promptTemplates";

interface SoulData {
  name?: string;
  emoji?: string;
  personality?: string;
  purpose?: string;
  tone?: string;
}

const TONE_PRESETS = [
  { label: "Warm & Genuine", value: "warm" },
  { label: "Professional", value: "professional" },
  { label: "Casual & Witty", value: "casual" },
  { label: "Concise & Direct", value: "concise" },
  { label: "Thoughtful & Detailed", value: "detailed" },
  { label: "Custom", value: "custom" },
];

const PERSONALITY_PRESETS = [
  { label: "Helpful Companion", desc: "Friendly, proactive, remembers context, adapts to your style" },
  { label: "Technical Expert", desc: "Precise, thorough, code-focused, explains tradeoffs" },
  { label: "Creative Partner", desc: "Imaginative, brainstorms freely, offers novel perspectives" },
  { label: "Executive Assistant", desc: "Organized, action-oriented, tracks tasks and follow-ups" },
  { label: "Custom", desc: "Define your own personality" },
];

export function AgentSoulTab() {
  const { data: agents } = useFetch<any[]>("/api/agents");
  const agent = agents?.[0];

  const [soul, setSoul] = useState<SoulData>({});
  const [systemPrompt, setSystemPrompt] = useState("");
  const [responseStyle, setResponseStyle] = useState({
    verbosity: 0.5, // 0=concise, 1=verbose
    formality: 0.5, // 0=casual, 1=formal
    tonePreset: "warm",
    customTone: "",
  });
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!agent) return;
    // Load soul
    gatewayFetch("/api/soul").then(r => r.json()).then(data => {
      if (data?.soul) setSoul(data.soul);
    }).catch(() => {});
    // Load system prompt from agent
    setSystemPrompt(agent.systemPrompt || "");
  }, [agent]);

  const save = async () => {
    if (!agent) return;
    setSaving(true);
    try {
      // Save system prompt
      await gatewayFetch("/api/settings/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: agent._id,
          systemPrompt,
        }),
      });

      // Save soul data
      if (soul.name || soul.personality || soul.purpose || soul.tone) {
        await gatewayFetch("/api/soul", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ soul }),
        });
      }

      // Save response style as config
      await gatewayFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "response_style",
          value: JSON.stringify(responseStyle),
        }),
      });

      toast.success("Agent soul saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const loadPreview = async () => {
    setLoadingPreview(true);
    try {
      const res = await gatewayFetch("/api/context/preview");
      if (res.ok) {
        const data = await res.json();
        setPreviewContent(data.systemPrompt || "No preview available");
      } else {
        setPreviewContent("Failed to load preview. The context is built dynamically per message.");
      }
    } catch {
      setPreviewContent("Preview unavailable. The full prompt is constructed at runtime using:\n\n1. Soul/Identity (SOUL.md template + database soul)\n2. System prompt (editable below)\n3. Knowledge base entries (matched by relevance)\n4. Conversation chain summaries\n5. Topic context from past conversations\n6. Project context (if linked)");
    }
    setLoadingPreview(false);
    setShowPreview(true);
  };

  const toneDescription = () => {
    const parts: string[] = [];
    if (responseStyle.verbosity < 0.3) parts.push("concise");
    else if (responseStyle.verbosity > 0.7) parts.push("detailed and thorough");
    if (responseStyle.formality < 0.3) parts.push("casual");
    else if (responseStyle.formality > 0.7) parts.push("formal and professional");
    const preset = TONE_PRESETS.find(t => t.value === responseStyle.tonePreset);
    if (preset && preset.value !== "custom") parts.push(preset.label.toLowerCase());
    return parts.length > 0 ? parts.join(", ") : "balanced";
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Agent Soul<HelpTooltip title="Agent Soul" content="Define your AI agent's personality, system prompt, and behavioral guidelines. This shapes how your AI responds across all channels." /></h2>
        <p className="text-sm text-zinc-400">Define your agent's personality, identity, and how it communicates.</p>
      </div>

      {/* Soul Identity */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            Soul / Personality
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Name</label>
              <Input
                value={soul.name || ""}
                onChange={(e) => setSoul(s => ({ ...s, name: e.target.value }))}
                placeholder="e.g. Nova, Atlas, Sage"
                className="bg-white/[0.06] border-white/[0.08] text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Emoji</label>
              <Input
                value={soul.emoji || ""}
                onChange={(e) => setSoul(s => ({ ...s, emoji: e.target.value }))}
                placeholder="🤖"
                className="bg-white/[0.06] border-white/[0.08] text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Personality</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PERSONALITY_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => {
                    if (p.label !== "Custom") setSoul(s => ({ ...s, personality: p.desc }));
                  }}
                  className={`px-3 py-1 rounded-lg text-xs transition-all ${
                    soul.personality === p.desc
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                      : "bg-white/[0.06] text-zinc-400 border border-white/[0.08] hover:bg-white/[0.10]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Textarea
              value={soul.personality || ""}
              onChange={(e) => setSoul(s => ({ ...s, personality: e.target.value }))}
              rows={2}
              placeholder="Describe the personality..."
              className="bg-white/[0.06] border-white/[0.08] text-white resize-none"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Purpose / Role</label>
            <Input
              value={soul.purpose || ""}
              onChange={(e) => setSoul(s => ({ ...s, purpose: e.target.value }))}
              placeholder="e.g. Personal assistant, coding partner, research companion"
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
        </CardContent>
      </Card>

      {/* Response Style */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Response Style</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Tone Preset</label>
            <Select
              value={responseStyle.tonePreset}
              onValueChange={(val) => setResponseStyle(s => ({ ...s, tonePreset: val }))}
            >
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONE_PRESETS.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {responseStyle.tonePreset === "custom" && (
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Custom Tone</label>
              <Input
                value={responseStyle.customTone}
                onChange={(e) => setResponseStyle(s => ({ ...s, customTone: e.target.value }))}
                placeholder="e.g. Dry humor, slightly sarcastic, uses analogies"
                className="bg-white/[0.06] border-white/[0.08] text-white"
              />
            </div>
          )}

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">
              Verbosity ({responseStyle.verbosity < 0.3 ? "Concise" : responseStyle.verbosity > 0.7 ? "Detailed" : "Balanced"})
            </label>
            <Slider
              min={0} max={1} step={0.1}
              value={responseStyle.verbosity}
              onChange={(v) => setResponseStyle(s => ({ ...s, verbosity: v }))}
            />
            <div className="flex justify-between text-xs text-zinc-600 mt-1">
              <span>Concise</span>
              <span>Detailed</span>
            </div>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1 block">
              Formality ({responseStyle.formality < 0.3 ? "Casual" : responseStyle.formality > 0.7 ? "Formal" : "Balanced"})
            </label>
            <Slider
              min={0} max={1} step={0.1}
              value={responseStyle.formality}
              onChange={(v) => setResponseStyle(s => ({ ...s, formality: v }))}
            />
            <div className="flex justify-between text-xs text-zinc-600 mt-1">
              <span>Casual</span>
              <span>Formal</span>
            </div>
          </div>

          <div className="text-xs text-zinc-500 bg-white/[0.03] rounded-lg px-3 py-2">
            Current style: <span className="text-zinc-300">{toneDescription()}</span>
          </div>
        </CardContent>
      </Card>

      {/* Prompt Templates */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <BookTemplate className="w-4 h-4" />
            Templates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500 mb-3">
            Pick a template as a starting point. It will populate the system prompt, personality, and tone - you can then customize everything.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {PROMPT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => {
                  setSystemPrompt(tpl.systemPrompt);
                  setSoul(s => ({
                    ...s,
                    personality: tpl.personality || s.personality,
                    purpose: tpl.purpose || s.purpose,
                  }));
                  if (tpl.tone) {
                    setResponseStyle(s => ({ ...s, tonePreset: tpl.tone! }));
                  }
                  toast.success(`Loaded "${tpl.name}" template - remember to save!`);
                }}
                className="text-left p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] hover:border-blue-500/20 transition-all group"
              >
                <div className="text-sm font-medium text-zinc-200 group-hover:text-blue-300 transition-colors">{tpl.name}</div>
                <div className="text-xs text-zinc-500 mt-1 line-clamp-2">{tpl.description}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* System Prompt */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">System Prompt (Advanced)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-zinc-500">
            This is the base system prompt stored on the agent. The final prompt sent to the AI also includes
            your soul, knowledge base entries, conversation context, and topic history - all assembled dynamically.
          </p>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={8}
            className="bg-white/[0.06] border-white/[0.08] text-white resize-none font-mono text-xs"
            placeholder="You are a helpful AI assistant..."
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadPreview}
              disabled={loadingPreview}
              className="border-white/[0.08] text-zinc-300"
            >
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              {loadingPreview ? "Loading..." : "Preview Full Prompt"}
            </Button>
            <span className="text-xs text-zinc-600">See what the AI actually receives</span>
          </div>

          {showPreview && (
            <div className="bg-black/30 border border-white/[0.08] rounded-xl p-4 max-h-96 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-400 font-medium">Constructed Prompt Preview</span>
                <button onClick={() => setShowPreview(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Close</button>
              </div>
              <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono">{previewContent}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        <Save className="w-4 h-4 mr-2" />
        {saving ? "Saving..." : "Save Soul & Style"}
      </Button>
    </div>
  );
}
import { HelpTooltip } from "@/components/HelpTooltip";
