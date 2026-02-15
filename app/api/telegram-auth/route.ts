import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const { action, telegramId, messageId } = await req.json();

    if (!action || !telegramId) {
      return NextResponse.json({ error: "action and telegramId required" }, { status: 400 });
    }

    if (action !== "approve" && action !== "block") {
      return NextResponse.json({ error: "action must be 'approve' or 'block'" }, { status: 400 });
    }

    if (action === "approve") {
      await convexClient.mutation(api.functions.telegramAuth.approveRequest, { telegramId });
    } else {
      await convexClient.mutation(api.functions.telegramAuth.blockRequest, { telegramId });
    }

    // Get bot token from gateway config
    let botToken: string | null = null;
    try {
      const result = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
        gatewayId: gatewayId as Id<"gateways">,
        key: "telegram_bot_token",
      });
      botToken = result?.value || null;
    } catch {
      botToken = await convexClient.query(api.functions.config.get, { key: "telegram_bot_token" });
    }

    if (botToken) {
      const tgMsg = action === "approve"
        ? "✅ You've been approved! How can I help?"
        : "❌ Access denied.";
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: telegramId, text: tgMsg }),
      });
    }

    if (messageId) {
      try {
        const msg = await convexClient.query(api.functions.messages.get, { id: messageId as Id<"messages"> });
        if (msg) {
          await convexClient.mutation(api.functions.messages.update, {
            id: messageId as Id<"messages">,
            content: action === "approve"
              ? `✅ Approved Telegram user ${telegramId}`
              : `❌ Blocked Telegram user ${telegramId}`,
            metadata: { type: "telegram_access_resolved", action, telegramId },
          });
        }
      } catch (e) {
        console.warn("Failed to update message after approval:", e);
      }
    }

    return NextResponse.json({ ok: true, action, telegramId });
  } catch (err) {
    return handleGatewayError(err);
  }
}
