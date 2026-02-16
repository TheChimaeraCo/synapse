// app/api/whatsapp/webhook/route.ts - WhatsApp Cloud API webhook endpoint
import { NextRequest, NextResponse } from "next/server";
import { handleVerification, handleIncomingWebhook, verifySignature } from "@/lib/whatsapp/webhook";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";

/**
 * GET - Webhook verification from Meta.
 * Meta sends hub.mode, hub.verify_token, hub.challenge as query params.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const config = await getWhatsAppConfig();
  if (!config) {
    return new NextResponse("WhatsApp not configured", { status: 503 });
  }

  const result = handleVerification(mode, token, challenge, config.verifyToken);
  return new NextResponse(result.body, { status: result.status });
}

/**
 * POST - Incoming messages and status updates from WhatsApp.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Verify signature if app secret is configured
  const config = await getWhatsAppConfig();
  if (config?.appSecret) {
    const signature = req.headers.get("x-hub-signature-256") || "";
    if (!verifySignature(rawBody, signature, config.appSecret)) {
      console.warn("[whatsapp] Invalid webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Process asynchronously - respond to Meta immediately
  handleIncomingWebhook(payload).catch((err) => {
    console.error("[whatsapp] Webhook processing error:", err);
  });

  // Always respond 200 to Meta quickly
  return NextResponse.json({ status: "ok" });
}
