import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { speechToText, getVoiceConfigFromDb } from "@/lib/voice";
import type { Id } from "@/convex/_generated/dataModel";

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const formData = await req.formData();
    const file = formData.get("audio") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Missing 'audio' field" }, { status: 400 });
    }

    const config = await getVoiceConfigFromDb(gatewayId as Id<"gateways">);
    console.log("[STT] provider:", config.sttProvider, "hasKey:", !!config.sttApiKey, "fileType:", file.type, "fileSize:", file.size);
    if (config.sttProvider === "none") {
      return NextResponse.json({ error: "STT is not configured" }, { status: 400 });
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio file too large (max 25MB)" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const text = await speechToText(buffer, config, {
      mimeType: file.type || "audio/webm",
      filename: file.name || undefined,
    });

    console.log("[STT] result:", JSON.stringify(text).slice(0, 200));
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[STT] error:", err);
    return handleGatewayError(err);
  }
}
