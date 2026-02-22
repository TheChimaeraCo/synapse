// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export interface VoiceConfig {
  ttsProvider: "elevenlabs" | "openai" | "google" | "none";
  ttsApiKey?: string;
  ttsVoice?: string;
  ttsModel?: string;
  ttsStability?: number;
  ttsSimilarity?: number;
  ttsStyle?: number;
  ttsSpeed?: number;
  sttProvider: "openai" | "google" | "groq" | "none";
  sttApiKey?: string;
}

interface SpeechInputOptions {
  mimeType?: string;
  filename?: string;
  language?: string;
}

const VOICE_CONFIG_KEYS = [
  "voice.tts_provider",
  "voice.tts_api_key",
  "voice.tts_voice",
  "voice.tts_model",
  "voice.tts_speed",
  "voice.tts_stability",
  "voice.tts_similarity",
  "voice.tts_style",
  "voice.stability",
  "voice.similarity",
  "voice.style",
  "voice.speed",
  "voice.stt_provider",
  "voice.stt_api_key",
  "voice_stt_provider",
  "voice_stt_api_key",
  "voice_tts_provider",
  "voice_tts_api_key",
  "voice_tts_voice",
  "voice_tts_model",
  "ai_api_key",
] as const;

function firstValue(configs: Record<string, string>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = configs[key];
    if (value != null && String(value).trim() !== "") return String(value);
  }
  return undefined;
}

function parseNumberValue(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extensionFromMime(mimeType?: string): string {
  const mime = (mimeType || "").toLowerCase();
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  return "webm";
}

function googleEncodingFromMime(mimeType?: string): { encoding?: string; sampleRateHertz?: number } {
  const mime = (mimeType || "").toLowerCase();
  if (mime.includes("webm")) return { encoding: "WEBM_OPUS", sampleRateHertz: 48000 };
  if (mime.includes("ogg")) return { encoding: "OGG_OPUS", sampleRateHertz: 48000 };
  if (mime.includes("wav")) return { encoding: "LINEAR16" };
  if (mime.includes("mpeg") || mime.includes("mp3")) return { encoding: "MP3" };
  return {};
}

function requireApiKey(provider: "elevenlabs" | "openai" | "google", key?: string): string {
  if (!key || !key.trim()) {
    throw new Error(`Missing API key for ${provider} voice provider`);
  }
  return key.trim();
}

export async function textToSpeech(text: string, config: VoiceConfig): Promise<Buffer> {
  if (config.ttsProvider === "none") {
    throw new Error("TTS is disabled");
  }
  const input = text.trim();
  if (!input) throw new Error("TTS input text is empty");

  if (config.ttsProvider === "elevenlabs") {
    const apiKey = requireApiKey("elevenlabs", config.ttsApiKey || process.env.ELEVENLABS_API_KEY);
    const voiceId = config.ttsVoice || "EXAVITQu4vr4xnSDxMaL";
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: input,
        model_id: config.ttsModel || "eleven_multilingual_v2",
        voice_settings: {
          stability: config.ttsStability ?? 0.5,
          similarity_boost: config.ttsSimilarity ?? 0.75,
          style: config.ttsStyle ?? 0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 402) {
        throw new Error("ElevenLabs requires a paid plan to use library voices via the API. Please upgrade your subscription at elevenlabs.io or switch to a different TTS provider.");
      }
      throw new Error(`ElevenLabs TTS failed (${res.status}): ${err}`);
    }

    return Buffer.from(await res.arrayBuffer());
  }

  if (config.ttsProvider === "openai") {
    const apiKey = requireApiKey("openai", config.ttsApiKey || process.env.OPENAI_API_KEY);
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.ttsModel || "gpt-4o-mini-tts",
        input,
        voice: config.ttsVoice || "alloy",
        speed: config.ttsSpeed ?? 1.0,
        response_format: "mp3",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI TTS failed (${res.status}): ${err}`);
    }

    return Buffer.from(await res.arrayBuffer());
  }

  if (config.ttsProvider === "google") {
    const apiKey = requireApiKey("google", config.ttsApiKey || process.env.GOOGLE_API_KEY);
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: input },
        voice: {
          languageCode: "en-US",
          name: config.ttsVoice || "en-US-Neural2-F",
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: config.ttsSpeed ?? 1.0,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google TTS failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    if (!data?.audioContent) throw new Error("Google TTS returned empty audio");
    return Buffer.from(data.audioContent, "base64");
  }

  throw new Error(`Unknown TTS provider: ${config.ttsProvider}`);
}

export async function speechToText(
  audioBuffer: Buffer,
  config: VoiceConfig,
  inputOptions?: SpeechInputOptions
): Promise<string> {
  if (config.sttProvider === "none") {
    throw new Error("STT is disabled");
  }
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error("Audio buffer is empty");
  }

  const mimeType = inputOptions?.mimeType || "audio/webm";
  const filename = inputOptions?.filename || `audio.${extensionFromMime(mimeType)}`;
  const language = inputOptions?.language || "en";

  if (config.sttProvider === "openai") {
    const apiKey = requireApiKey("openai", config.sttApiKey || process.env.OPENAI_API_KEY);
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    formData.append("file", blob, filename);
    formData.append("model", "whisper-1");
    formData.append("language", language);

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI STT failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    return String(data?.text || "").trim();
  }

  if (config.sttProvider === "groq") {
    const apiKey = requireApiKey("groq" as any, config.sttApiKey || process.env.GROQ_API_KEY);
    const formData = new FormData();
    // Groq Whisper works better with explicit file extensions matching the codec
    const groqExt = mimeType.includes("opus") ? "ogg" : extensionFromMime(mimeType);
    const groqFilename = `recording.${groqExt}`;
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    formData.append("file", blob, groqFilename);
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("language", language);
    formData.append("response_format", "verbose_json");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq STT failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    console.log("[Groq STT] response:", JSON.stringify(data).slice(0, 500));
    return String(data?.text || "").trim();
  }

  if (config.sttProvider === "google") {
    const apiKey = requireApiKey("google", config.sttApiKey || process.env.GOOGLE_API_KEY);
    const { encoding, sampleRateHertz } = googleEncodingFromMime(mimeType);
    const googleConfig: Record<string, any> = {
      languageCode: inputOptions?.language || "en-US",
      enableAutomaticPunctuation: true,
      model: "latest_short",
    };
    if (encoding) googleConfig.encoding = encoding;
    if (sampleRateHertz) googleConfig.sampleRateHertz = sampleRateHertz;

    const res = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: googleConfig,
        audio: { content: audioBuffer.toString("base64") },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google STT failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    return results
      .map((r: any) => r?.alternatives?.[0]?.transcript || "")
      .join(" ")
      .trim();
  }

  throw new Error(`Unknown STT provider: ${config.sttProvider}`);
}

export async function getVoiceConfigFromDb(gatewayId?: Id<"gateways">): Promise<VoiceConfig> {
  try {
    const configs: Record<string, string> = {};

    if (gatewayId) {
      const values = await Promise.all(
        VOICE_CONFIG_KEYS.map(async (key) => {
          try {
            const result = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
              gatewayId,
              key,
            });
            return [key, result?.value ? String(result.value) : ""] as const;
          } catch {
            return [key, ""] as const;
          }
        })
      );
      for (const [key, value] of values) {
        if (value) configs[key] = value;
      }
    } else {
      try {
        const globalConfigs = await convexClient.query(api.functions.config.getMultiple, {
          keys: [...VOICE_CONFIG_KEYS],
        });
        Object.assign(configs, globalConfigs || {});
      } catch {
        // Continue with env fallback below
      }
    }

    const ttsProviderRaw = firstValue(configs, ["voice.tts_provider", "voice_tts_provider"]) || "none";
    const sttProviderRaw = firstValue(configs, ["voice.stt_provider", "voice_stt_provider"]) || "groq";
    const ttsProvider = (["elevenlabs", "openai", "google", "none"].includes(ttsProviderRaw) ? ttsProviderRaw : "none") as VoiceConfig["ttsProvider"];
    const sttProvider = (["openai", "google", "groq", "none"].includes(sttProviderRaw) ? sttProviderRaw : "groq") as VoiceConfig["sttProvider"];

    const ttsApiKey =
      firstValue(configs, ["voice.tts_api_key", "voice_tts_api_key", "ai_api_key"]) ||
      (ttsProvider === "elevenlabs" ? process.env.ELEVENLABS_API_KEY : undefined) ||
      (ttsProvider === "openai" ? process.env.OPENAI_API_KEY : undefined) ||
      (ttsProvider === "google" ? process.env.GOOGLE_API_KEY : undefined);

    const sttApiKey =
      firstValue(configs, ["voice.stt_api_key", "voice_stt_api_key"]) ||
      firstValue(configs, ["voice.tts_api_key", "voice_tts_api_key", "ai_api_key"]) ||
      (sttProvider === "openai" ? process.env.OPENAI_API_KEY : undefined) ||
      (sttProvider === "groq" ? process.env.GROQ_API_KEY : undefined) ||
      (sttProvider === "google" ? process.env.GOOGLE_API_KEY : undefined);

    return {
      ttsProvider,
      ttsApiKey,
      ttsVoice: firstValue(configs, ["voice.tts_voice", "voice_tts_voice"]),
      ttsModel: firstValue(configs, ["voice.tts_model", "voice_tts_model"]),
      ttsStability: parseNumberValue(firstValue(configs, ["voice.tts_stability", "voice.stability"])),
      ttsSimilarity: parseNumberValue(firstValue(configs, ["voice.tts_similarity", "voice.similarity"])),
      ttsStyle: parseNumberValue(firstValue(configs, ["voice.tts_style", "voice.style"])),
      ttsSpeed: parseNumberValue(firstValue(configs, ["voice.tts_speed", "voice.speed"])),
      sttProvider,
      sttApiKey,
    };
  } catch (err) {
    console.error("[voice] Failed to load voice config:", err);
    return { ttsProvider: "none", sttProvider: "none" };
  }
}
