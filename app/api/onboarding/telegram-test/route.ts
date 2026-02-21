import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * GET /api/onboarding/telegram-test
 * Check if telegram bot token is valid and get bot info.
 * Also returns pending access requests so user can be whitelisted.
 */
export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);

    // Get telegram bot token from env
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return NextResponse.json({ configured: false, error: "No Telegram bot token configured" });
    }

    // Test the bot token
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await res.json();
      if (!data.ok) {
        return NextResponse.json({ configured: true, valid: false, error: data.description });
      }

      // Get pending requests
      const pending = await convexClient.query(api.functions.telegramAuth.listPending);
      const allowed = await convexClient.query(api.functions.telegramAuth.listAllowed);

      return NextResponse.json({
        configured: true,
        valid: true,
        bot: {
          username: data.result.username,
          firstName: data.result.first_name,
          id: data.result.id,
        },
        pending: pending.map((p: any) => ({
          telegramId: p.telegramId,
          displayName: p.displayName,
          username: p.username,
        })),
        allowed: allowed.map((a: any) => ({
          telegramId: a.telegramId,
          displayName: a.displayName,
          username: a.username,
        })),
      });
    } catch (err: any) {
      return NextResponse.json({ configured: true, valid: false, error: err.message });
    }
  } catch (err) {
    return handleGatewayError(err);
  }
}

/**
 * POST /api/onboarding/telegram-test
 * Whitelist a telegram user by ID or approve a pending request.
 */
export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const body = await req.json();
    const { action } = body;

    if (action === "approve") {
      const { telegramId } = body;
      if (!telegramId) {
        return NextResponse.json({ error: "telegramId required" }, { status: 400 });
      }

      await convexClient.mutation(api.functions.telegramAuth.approveRequest, {
        telegramId: String(telegramId),
      });

      // Send confirmation via Telegram
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) {
        try {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: telegramId,
              text: "✅ You've been approved! I'm ready to chat. Say hello!",
            }),
          });
        } catch {}
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "whitelist") {
      // Directly add to allowlist without a pending request
      const { telegramId, displayName, username } = body;
      if (!telegramId) {
        return NextResponse.json({ error: "telegramId required" }, { status: 400 });
      }

      // Check if already allowed
      const allowed = await convexClient.query(api.functions.telegramAuth.listAllowed);
      const exists = allowed.some((a: any) => a.telegramId === String(telegramId));
      
      if (!exists) {
        // Create a request and immediately approve it
        try {
          await convexClient.mutation(api.functions.telegramAuth.createRequest, {
            telegramId: String(telegramId),
            displayName: displayName || "Owner",
            username: username || undefined,
          });
        } catch {}
        
        await convexClient.mutation(api.functions.telegramAuth.approveRequest, {
          telegramId: String(telegramId),
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "send-test") {
      // Send a test message to verify the bot works
      const { chatId } = body;
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        return NextResponse.json({ error: "No bot token" }, { status: 400 });
      }

      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "🎉 Connection test successful! Your Synapse bot is working.",
          }),
        });
        const data = await res.json();
        return NextResponse.json({ ok: data.ok, error: data.description });
      } catch (err: any) {
        return NextResponse.json({ ok: false, error: err.message });
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return handleGatewayError(err);
  }
}
