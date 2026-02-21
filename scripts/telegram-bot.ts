#!/usr/bin/env npx tsx
// scripts/telegram-bot.ts - Standalone Telegram bot runner
// Run with: npx tsx scripts/telegram-bot.ts

import convexEnv from "./convex-env.js";

// Load from Convex env first, then local .env.local compatibility fallback.
try {
  const pulled = (convexEnv as any).loadProcessEnvFromConvex({ silent: true, writeFile: true }) as Record<string, string>;
  const count = Object.keys(pulled || {}).length;
  if (count > 0) {
    console.log(`[telegram-bot] Loaded ${count} env vars from Convex`);
  }
} catch (e) {
  console.error("[telegram-bot] Convex env pull failed:", e);
}

try {
  const local = (convexEnv as any).readEnvFile?.() || {};
  for (const [k, v] of Object.entries(local)) {
    if (!process.env[k]) process.env[k] = String(v);
  }
  console.log("[telegram-bot] Loaded local compatibility env, CONVEX_SELF_HOSTED_ADMIN_KEY:", process.env.CONVEX_SELF_HOSTED_ADMIN_KEY ? "SET" : "MISSING");
} catch (e) {
  console.error("[telegram-bot] Failed to load local compatibility env:", e);
}

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
      console.error("[telegram-bot] Set TELEGRAM_BOT_TOKEN in Convex env vars or via Settings to enable.");
      // Exit with 0 so PM2 stops restarting (configure with --stop-exit-codes 0)
      process.exit(0);
    }
    console.error("[telegram-bot] Fatal error:", err);
    process.exit(1);
  }
}

main();
