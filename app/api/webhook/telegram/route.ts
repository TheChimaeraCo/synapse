import { NextResponse } from "next/server";

// DEPRECATED: Telegram webhook proxy is no longer used.
// Messages are now received via grammY long polling (lib/telegram/bot.ts).
// This endpoint is kept to avoid 404s during transition but does nothing.

export async function POST() {
  console.warn("[telegram] Webhook endpoint called but bot uses long polling now");
  return NextResponse.json(
    { ok: true, note: "Webhook deprecated - using long polling via grammY" },
    { status: 200 }
  );
}
