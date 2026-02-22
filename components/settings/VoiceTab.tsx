"use client";
import { HelpTooltip } from "@/components/HelpTooltip";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfigSettings } from "@/lib/useConfigSettings";
import { Volume2, Loader2, RefreshCw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";

type ElevenModel = { id: string; name: string; description?: string };

const DEFAULT_ELEVEN_MODELS: ElevenModel[] = [
  { id: "eleven_flash_v2_5", name: "Eleven Flash v2.5", description: "Fastest, low latency" },
  { id: "eleven_turbo_v2_5", name: "Eleven Turbo v2.5", description: "Balanced speed and quality" },
  { id: "eleven_multilingual_v2", name: "Eleven Multilingual v2", description: "High quality multilingual voice" },
];

export function VoiceTab() {
  const { get, set, save, saving, loading } = useConfigSettings("voice.");
  const [testText, setTestText] = useState("Hello, this is a test of the voice system.");
  const [testing, setTesting] = useState(false);
  const [loadingElevenModels, setLoadingElevenModels] = useState(false);
  const [elevenModels, setElevenModels] = useState<ElevenModel[]>(DEFAULT_ELEVEN_MODELS);
  const [elevenModelsError, setElevenModelsError] = useState<string | null>(null);

  const handleTest = async () => {
    if (!testText.trim()) return;
    setTesting(true);
    try {
      const res = await gatewayFetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testText }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "TTS failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
      audio.onended = () => URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("TTS test failed: " + err.message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="text-zinc-400">Loading...</div>;

  const provider = get("tts_provider", "none");
  const ttsApiKey = get("tts_api_key", "");
  const selectedModel = get("tts_model", "");

  const loadElevenModels = async (apiKey?: string) => {
    setLoadingElevenModels(true);
    setElevenModelsError(null);
    try {
      const res = await gatewayFetch("/api/voice/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "elevenlabs", ...(apiKey ? { apiKey } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load ElevenLabs models");
      }
      const data = await res.json();
      const fetched = Array.isArray(data?.models) ? data.models : [];
      const normalized = fetched
        .map((m: any) => ({ id: String(m?.id || ""), name: String(m?.name || m?.id || ""), description: typeof m?.description === "string" ? m.description : undefined }))
        .filter((m: ElevenModel) => m.id);
      if (normalized.length > 0) {
        setElevenModels(normalized);
      } else {
        setElevenModels(DEFAULT_ELEVEN_MODELS);
      }
      if (typeof data?.error === "string" && data.error) {
        setElevenModelsError(data.error);
      }
    } catch (err: any) {
      setElevenModels(DEFAULT_ELEVEN_MODELS);
      setElevenModelsError(err?.message || "Could not load model list");
    } finally {
      setLoadingElevenModels(false);
    }
  };

  useEffect(() => {
    if (provider !== "elevenlabs") return;
    if (!selectedModel) {
      set("tts_model", "eleven_flash_v2_5");
    }
    const timer = setTimeout(() => {
      void loadElevenModels(ttsApiKey || undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [provider, selectedModel, ttsApiKey, set]);

  const elevenModelOptions = useMemo(() => {
    const map = new Map<string, ElevenModel>();
    DEFAULT_ELEVEN_MODELS.forEach((m) => map.set(m.id, m));
    elevenModels.forEach((m) => map.set(m.id, m));
    if (selectedModel && !map.has(selectedModel)) {
      map.set(selectedModel, { id: selectedModel, name: `Current: ${selectedModel}` });
    }
    return Array.from(map.values());
  }, [elevenModels, selectedModel]);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Voice & Audio<HelpTooltip title="Voice & Audio" content="Configure text-to-speech and speech-to-text settings. Choose voices, languages, and audio processing options." /></h2>
        <p className="text-sm text-zinc-400">Configure text-to-speech and speech-to-text settings.</p>
      </div>

      {/* TTS Provider */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Text-to-Speech</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">TTS Provider</label>
            <Select value={get("tts_provider", "none")} onValueChange={(val) => set("tts_provider", val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Disabled</SelectItem>
                <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="google">Google Cloud</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {provider !== "none" && (
            <>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">API Key</label>
                <Input
                  type="password"
                  value={get("tts_api_key", "")}
                  onChange={(e) => set("tts_api_key", e.target.value)}
                  placeholder="Enter API key"
                  className="bg-white/[0.06] border-white/[0.08] text-white"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Voice ID</label>
                <Input
                  value={get("tts_voice", "")}
                  onChange={(e) => set("tts_voice", e.target.value)}
                  placeholder={provider === "elevenlabs" ? "e.g. EXAVITQu4vr4xnSDxMaL" : provider === "openai" ? "alloy, echo, fable, onyx, nova, shimmer" : "en-US-Neural2-F"}
                  className="bg-white/[0.06] border-white/[0.08] text-white"
                />
              </div>
              {provider === "elevenlabs" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm text-zinc-400 block">Model</label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200"
                      onClick={() => void loadElevenModels(ttsApiKey || undefined)}
                      disabled={loadingElevenModels}
                    >
                      {loadingElevenModels ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                      Refresh
                    </Button>
                  </div>
                  <Select value={selectedModel || "eleven_flash_v2_5"} onValueChange={(val) => set("tts_model", val)}>
                    <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                      <SelectValue placeholder="Choose ElevenLabs model..." />
                    </SelectTrigger>
                    <SelectContent>
                      {elevenModelOptions.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-500">
                    Recommended: <button type="button" className="underline underline-offset-2 hover:text-zinc-300" onClick={() => set("tts_model", "eleven_flash_v2_5")}>eleven_flash_v2_5</button> for fastest response.
                  </p>
                  {elevenModelsError && <p className="text-xs text-amber-400">{elevenModelsError}</p>}
                </div>
              ) : (
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Model</label>
                  <Input
                    value={get("tts_model", "")}
                    onChange={(e) => set("tts_model", e.target.value)}
                    placeholder={provider === "openai" ? "gpt-4o-mini-tts" : "Google voice model (optional)"}
                    className="bg-white/[0.06] border-white/[0.08] text-white"
                  />
                </div>
              )}
            </>
          )}

          {provider === "elevenlabs" && (
            <>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Stability ({get("stability", "0.5")})</label>
                <Slider min={0} max={1} step={0.05} value={parseFloat(get("stability", "0.5"))} onChange={(v) => set("stability", String(v))} />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Similarity Boost ({get("similarity", "0.75")})</label>
                <Slider min={0} max={1} step={0.05} value={parseFloat(get("similarity", "0.75"))} onChange={(v) => set("similarity", String(v))} />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Style ({get("style", "0")})</label>
                <Slider min={0} max={1} step={0.05} value={parseFloat(get("style", "0"))} onChange={(v) => set("style", String(v))} />
              </div>
            </>
          )}

          {provider !== "none" && (
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Speed ({get("speed", "1.2")})</label>
              <Slider min={0.5} max={2} step={0.1} value={parseFloat(get("speed", "1.2"))} onChange={(v) => set("speed", String(v))} />
              <p className="text-xs text-zinc-500 mt-1">
                OpenAI/Google apply this in synthesis. ElevenLabs uses client playback speed.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* STT Provider */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Speech-to-Text</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">STT Provider</label>
            <Select value={get("stt_provider", "groq")} onValueChange={(val) => set("stt_provider", val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Disabled</SelectItem>
                <SelectItem value="browser">Browser Native (Free, local)</SelectItem>
                <SelectItem value="groq">Groq Whisper (Free)</SelectItem>
                <SelectItem value="openai">OpenAI Whisper</SelectItem>
                <SelectItem value="google">Google Cloud</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">STT Language</label>
            <Input
              value={get("stt_language", "en-US")}
              onChange={(e) => set("stt_language", e.target.value)}
              placeholder="e.g. en-US"
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
          {get("stt_provider", "groq") !== "none" && get("stt_provider", "groq") !== "browser" && (
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">STT API Key (leave blank to use TTS key)</label>
              <Input
                type="password"
                value={get("stt_api_key", "")}
                onChange={(e) => set("stt_api_key", e.target.value)}
                placeholder="Uses TTS key if empty"
                className="bg-white/[0.06] border-white/[0.08] text-white"
              />
            </div>
          )}
          {get("stt_provider", "groq") === "browser" && (
            <p className="text-xs text-zinc-500">
              Browser-native recognition runs locally in supported browsers (Chrome/Edge). No STT API key required.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Behavior */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Behavior</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Auto-read responses</p>
              <p className="text-xs text-zinc-500">Automatically play TTS for assistant messages</p>
            </div>
            <Toggle
              checked={get("auto_read", "false") === "true"}
              onChange={(v) => set("auto_read", v ? "true" : "false")}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Stream speech while generating</p>
              <p className="text-xs text-zinc-500">Start speaking partial response chunks before full completion</p>
            </div>
            <Toggle
              checked={get("stream_tts", "true") === "true"}
              onChange={(v) => set("stream_tts", v ? "true" : "false")}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Barge-in interrupt</p>
              <p className="text-xs text-zinc-500">If you start talking while it responds, interrupt and listen to you</p>
            </div>
            <Toggle
              checked={get("barge_in", "true") === "true"}
              onChange={(v) => set("barge_in", v ? "true" : "false")}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Auto-transcribe voice messages</p>
              <p className="text-xs text-zinc-500">Automatically convert incoming voice to text</p>
            </div>
            <Toggle
              checked={get("auto_transcribe", "true") === "true"}
              onChange={(v) => set("auto_transcribe", v ? "true" : "false")}
            />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Max Text Length for TTS</label>
            <Input
              type="number"
              value={get("max_text_length", "5000")}
              onChange={(e) => set("max_text_length", e.target.value)}
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
            <p className="text-xs text-zinc-500 mt-1">Longer texts will be truncated before conversion.</p>
          </div>
        </CardContent>
      </Card>

      {/* Test */}
      {provider !== "none" && (
        <Card className="bg-white/[0.04] border-white/[0.06]">
          <CardHeader>
            <CardTitle className="text-sm text-zinc-300">Test TTS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Type text to test..."
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
            <Button onClick={handleTest} disabled={testing} variant="outline" className="gap-2">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
              {testing ? "Playing..." : "Test Voice"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
