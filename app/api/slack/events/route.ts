// app/api/slack/events/route.ts - Slack Events API endpoint
import { NextRequest, NextResponse } from "next/server";
import { verifySignature, handleIncomingEvent } from "@/lib/slack/webhook";
import { getSlackConfig } from "@/lib/slack/config";

/**
 * POST - Slack Events API (URL verification + event callbacks)
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const config = await getSlackConfig();
  if (!config) {
    return NextResponse.json({ error: "Slack not configured" }, { status: 503 });
  }

  // Verify signature
  const timestamp = req.headers.get("x-slack-request-timestamp") || "";
  const signature = req.headers.get("x-slack-signature") || "";

  if (!verifySignature(rawBody, timestamp, signature, config.signingSecret)) {
    console.warn("[slack] Invalid request signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Handle URL verification challenge
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // Handle event callbacks
  if (payload.type === "event_callback") {
    // Process asynchronously - respond to Slack immediately
    handleIncomingEvent(payload).catch((err) => {
      console.error("[slack] Event processing error:", err);
    });
  }

  // Always respond 200 quickly
  return NextResponse.json({ status: "ok" });
}
