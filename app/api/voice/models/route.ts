import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getVoiceConfigFromDb } from "@/lib/voice";
import type { Id } from "@/convex/_generated/dataModel";

const DEFAULT_ELEVEN_MODELS = [
  { id: "eleven_flash_v2_5", name: "Eleven Flash v2.5", description: "Fastest, low latency" },
  { id: "eleven_turbo_v2_5", name: "Eleven Turbo v2.5", description: "Balanced speed and quality" },
  { id: "eleven_multilingual_v2", name: "Eleven Multilingual v2", description: "High quality multilingual voice" },
];

function normalizeModel(item: any): { id: string; name: string; description?: string } | null {
  const id = String(item?.model_id || item?.id || "").trim();
  if (!id) return null;
  const name = String(item?.name || id).trim();
  const description = typeof item?.description === "string" ? item.description : undefined;
  return { id, name, description };
}

function pickElevenModels(payload: any): Array<{ id: string; name: string; description?: string }> {
  const rawList = Array.isArray(payload?.models) ? payload.models : [];
  const ttsCandidates = rawList
    .filter((m: any) =>
      m?.can_do_text_to_speech === true ||
      m?.supports_tts === true ||
      m?.type === "tts" ||
      m?.category === "tts" ||
      typeof m?.can_do_text_to_speech === "undefined"
    )
    .map(normalizeModel)
    .filter((m: any) => !!m) as Array<{ id: string; name: string; description?: string }>;

  if (ttsCandidates.length === 0) return DEFAULT_ELEVEN_MODELS;

  const seen = new Set<string>();
  const merged = [...DEFAULT_ELEVEN_MODELS, ...ttsCandidates].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
  return merged;
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const body = await req.json().catch(() => ({}));
    const provider = String(body?.provider || "").toLowerCase();
    if (provider !== "elevenlabs") {
      return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
    }

    const config = await getVoiceConfigFromDb(gatewayId as Id<"gateways">);
    const overrideKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    const apiKey = overrideKey || config.ttsApiKey || process.env.ELEVENLABS_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json({
        models: DEFAULT_ELEVEN_MODELS,
        fallback: true,
        error: "Missing ElevenLabs API key",
      });
    }

    const elevenRes = await fetch("https://api.elevenlabs.io/v1/models", {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
        Accept: "application/json",
      },
    });

    if (!elevenRes.ok) {
      const err = await elevenRes.text().catch(() => "");
      return NextResponse.json({
        models: DEFAULT_ELEVEN_MODELS,
        fallback: true,
        error: `ElevenLabs models request failed (${elevenRes.status})${err ? `: ${err}` : ""}`,
      });
    }

    const data = await elevenRes.json().catch(() => ({}));
    const models = pickElevenModels(data);
    return NextResponse.json({ models, fallback: false });
  } catch (err) {
    return handleGatewayError(err);
  }
}

