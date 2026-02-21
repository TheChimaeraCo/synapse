// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0
export interface VoiceConfig {
  ttsProvider: "elevenlabs" | "openai" | "google" | "none";
  ttsApiKey?: string;
  ttsVoice?: string;
  ttsModel?: string;
  ttsStability?: number;
  ttsSimilarity?: number;
  ttsStyle?: number;
  ttsSpeed?: number;
  sttProvider: "openai" | "google" | "none";
  sttApiKey?: string;
}

export async function textToSpeech(text: string, config: VoiceConfig): Promise<Buffer> {
  if (config.ttsProvider === "none") {
    throw new Error("TTS is disabled");
  }

  if (config.ttsProvider === "elevenlabs") {
    const voiceId = config.ttsVoice || "EXAVITQu4vr4xnSDxMaL";
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": config.ttsApiKey || "",
      },
      body: JSON.stringify({
        text,
        model_id: config.ttsModel || "eleven_monolingual_v1",
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
      throw new Error(`ElevenLabs TTS failed (${res.status}): ${err}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  if (config.ttsProvider === "openai") {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ttsApiKey || ""}`,
      },
      body: JSON.stringify({
        model: config.ttsModel || "tts-1",
        input: text,
        voice: config.ttsVoice || "alloy",
        speed: config.ttsSpeed ?? 1.0,
        response_format: "mp3",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI TTS failed (${res.status}): ${err}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  if (config.ttsProvider === "google") {
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${config.ttsApiKey || ""}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: "en-US",
            name: config.ttsVoice || "en-US-Neural2-F",
          },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: config.ttsSpeed ?? 1.0,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google TTS failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    return Buffer.from(data.audioContent, "base64");
  }

  throw new Error(`Unknown TTS provider: ${config.ttsProvider}`);
}

export async function speechToText(audioBuffer: Buffer, config: VoiceConfig): Promise<string> {
  if (config.sttProvider === "none") {
    throw new Error("STT is disabled");
  }

  if (config.sttProvider === "openai") {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/mpeg" });
    formData.append("file", blob, "audio.mp3");
    formData.append("model", "whisper-1");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.sttApiKey || ""}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI STT failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    return data.text;
  }

  if (config.sttProvider === "google") {
    const res = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${config.sttApiKey || ""}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            encoding: "MP3",
            sampleRateHertz: 16000,
            languageCode: "en-US",
          },
          audio: {
            content: audioBuffer.toString("base64"),
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google STT failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    const results = data.results || [];
    return results.map((r: any) => r.alternatives?.[0]?.transcript || "").join(" ");
  }

  throw new Error(`Unknown STT provider: ${config.sttProvider}`);
}

export async function getVoiceConfigFromDb(): Promise<VoiceConfig> {
  // Helper to load config from systemConfig table via API
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${baseUrl}/api/config/all`, {
      headers: { "x-internal": "true" },
    });
    if (!res.ok) throw new Error("Failed to fetch config");
    const configs: Record<string, string> = await res.json();

    return {
      ttsProvider: (configs["voice_tts_provider"] as VoiceConfig["ttsProvider"]) || "none",
      ttsApiKey: configs["voice_tts_api_key"] || undefined,
      ttsVoice: configs["voice_tts_voice"] || undefined,
      ttsModel: configs["voice_tts_model"] || undefined,
      ttsStability: configs["voice.stability"] ? parseFloat(configs["voice.stability"]) : undefined,
      ttsSimilarity: configs["voice.similarity"] ? parseFloat(configs["voice.similarity"]) : undefined,
      ttsStyle: configs["voice.style"] ? parseFloat(configs["voice.style"]) : undefined,
      ttsSpeed: configs["voice.speed"] ? parseFloat(configs["voice.speed"]) : undefined,
      sttProvider: (configs["voice_stt_provider"] as VoiceConfig["sttProvider"]) || "openai",
      sttApiKey: configs["voice_stt_api_key"] || configs["voice_tts_api_key"] || undefined,
    };
  } catch {
    return { ttsProvider: "none", sttProvider: "none" };
  }
}
