import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { speechToText, getVoiceConfigFromDb } from "@/lib/voice";

export async function POST(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const formData = await req.formData();
    const file = formData.get("audio") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Missing 'audio' field" }, { status: 400 });
    }

    const config = await getVoiceConfigFromDb();
    if (config.sttProvider === "none") {
      return NextResponse.json({ error: "STT is not configured" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const text = await speechToText(buffer, config);

    return NextResponse.json({ text });
  } catch (err) {
    return handleGatewayError(err);
  }
}
