import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function POST(req: NextRequest) {
  try {
    const convex = getConvexClient();
    const { botToken, webhookUrl, secret } = await req.json();

    // If no webhookUrl provided, construct from server-side env
    const finalWebhookUrl = webhookUrl || `${process.env.CONVEX_SITE_URL || "http://127.0.0.1:3221"}/webhook/telegram`;

    const result = await convex.action(api.functions.config.registerTelegramWebhook, {
      botToken,
      webhookUrl: finalWebhookUrl,
      secret,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Register webhook error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
