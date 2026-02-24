import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { textToSpeech, getVoiceConfigFromDb } from "@/lib/voice";
import type { Id } from "@/convex/_generated/dataModel";
import { prepareTextForSpeech } from "@/lib/voiceText";

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const body = await req.json();
    const { text, voice } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text' field" }, { status: 400 });
    }

    const config = await getVoiceConfigFromDb(gatewayId as Id<"gateways">);
    if (config.ttsProvider === "none") {
      return NextResponse.json({ error: "TTS is not configured" }, { status: 400 });
    }

    if (voice) config.ttsVoice = voice;

    const cleanedText = prepareTextForSpeech(text, 5000);
    if (!cleanedText) {
      return NextResponse.json({ error: "No speakable text after formatting" }, { status: 400 });
    }

    const audioBuffer = await textToSpeech(cleanedText, config);
    const contentType = config.ttsProvider === "groq" ? "audio/wav" : "audio/mpeg";
    const filename = config.ttsProvider === "groq" ? "speech.wav" : "speech.mp3";

    return new NextResponse(new Uint8Array(audioBuffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": audioBuffer.length.toString(),
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}
