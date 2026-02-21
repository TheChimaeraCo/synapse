#!/usr/bin/env npx tsx
// scripts/discord-bot.ts - Standalone Discord bot runner
// Run with: npx tsx scripts/discord-bot.ts

import convexEnv from "./convex-env.js";

// Load from Convex env first, then local .env.local compatibility fallback.
try {
  const pulled = (convexEnv as any).loadProcessEnvFromConvex({ silent: true, writeFile: true }) as Record<string, string>;
  const count = Object.keys(pulled || {}).length;
  if (count > 0) {
    console.log(`[discord-bot] Loaded ${count} env vars from Convex`);
  }
} catch (e) {
  console.error("[discord-bot] Convex env pull failed:", e);
}

try {
  const local = (convexEnv as any).readEnvFile?.() || {};
  for (const [k, v] of Object.entries(local)) {
    if (!process.env[k]) process.env[k] = String(v);
  }
  console.log("[discord-bot] Loaded local compatibility env");
} catch (e) {
  console.error("[discord-bot] Failed to load local compatibility env:", e);
}

async function main() {
  const { startDiscordBot, stopDiscordBot } = await import("../lib/discord/startup");

  const GATEWAY_ID = process.env.GATEWAY_ID;
  if (GATEWAY_ID) {
    console.log(`[discord-bot] Gateway ID: ${GATEWAY_ID}`);
  } else {
    console.log("[discord-bot] No GATEWAY_ID set, using default config");
  }

  console.log("[discord-bot] Starting standalone Discord bot...");

  const shutdown = async (signal: string) => {
    console.log(`[discord-bot] Received ${signal}, shutting down...`);
    await stopDiscordBot();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  try {
    await startDiscordBot(GATEWAY_ID);
    console.log("[discord-bot] Bot is running. Press Ctrl+C to stop.");
  } catch (err: any) {
    if (err?.message?.includes("not configured") || err?.message?.includes("token")) {
      console.error("[discord-bot] Discord bot token not configured. Exiting gracefully.");
      process.exit(0);
    }
    console.error("[discord-bot] Fatal error:", err);
    process.exit(1);
  }
}

main();
