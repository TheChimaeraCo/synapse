#!/usr/bin/env npx tsx
// scripts/telegram-bot.ts - Standalone Telegram bot runner
// Run with: npx tsx scripts/telegram-bot.ts

// Load .env.local BEFORE anything else
import { readFileSync } from "node:fs";
try {
  const content = readFileSync("/root/clawd/projects/chimera-gateway/synapse/.env.local", "utf-8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i), v = t.slice(i + 1);
    if (!process.env[k]) process.env[k] = v;
  }
  console.log("[telegram-bot] Loaded .env.local, CONVEX_SELF_HOSTED_ADMIN_KEY:", process.env.CONVEX_SELF_HOSTED_ADMIN_KEY ? "SET" : "MISSING");
} catch (e) { console.error("[telegram-bot] Failed to load .env.local:", e); }

async function main() {
  // Dynamic import AFTER env is loaded
  const { startTelegramBot, stopTelegramBot } = await import("../lib/telegram/startup");

  const GATEWAY_ID = process.env.GATEWAY_ID;
  if (GATEWAY_ID) {
    console.log(`[telegram-bot] Gateway ID: ${GATEWAY_ID}`);
  } else {
    console.log("[telegram-bot] No GATEWAY_ID set, using default config");
  }

  // Verify multi-channel integration availability
  const licenseKey = process.env.SYNAPSE_LICENSE_KEY || process.env.LICENSE_KEY || "";
  if (!licenseKey) {
    console.log("[telegram-bot] Running on personal tier - Telegram integration included in core features");
  }

  console.log("[telegram-bot] Starting standalone Telegram bot...");

  const shutdown = async (signal: string) => {
    console.log(`[telegram-bot] Received ${signal}, shutting down...`);
    await stopTelegramBot();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  try {
    await startTelegramBot(GATEWAY_ID);
    console.log("[telegram-bot] Bot is running. Press Ctrl+C to stop.");
  } catch (err: any) {
    if (err?.message?.includes("not configured") || err?.message?.includes("token")) {
      console.error("[telegram-bot] Telegram bot token not configured. Exiting gracefully (will not restart).");
      console.error("[telegram-bot] Set TELEGRAM_BOT_TOKEN in .env.local or via Settings to enable.");
      // Exit with 0 so PM2 stops restarting (configure with --stop-exit-codes 0)
      process.exit(0);
    }
    console.error("[telegram-bot] Fatal error:", err);
    process.exit(1);
  }
}

main();
