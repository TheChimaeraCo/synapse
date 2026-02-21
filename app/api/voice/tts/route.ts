import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { textToSpeech, getVoiceConfigFromDb } from "@/lib/voice";

export async function POST(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const body = await req.json();
    const { text, voice } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text' field" }, { status: 400 });
    }

    const config = await getVoiceConfigFromDb();
    if (config.ttsProvider === "none") {
      return NextResponse.json({ error: "TTS is not configured" }, { status: 400 });
    }

    if (voice) config.ttsVoice = voice;

    const audioBuffer = await textToSpeech(text, config);

    return new NextResponse(new Uint8Array(audioBuffer), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
        "Content-Disposition": 'inline; filename="speech.mp3"',
      },
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}
