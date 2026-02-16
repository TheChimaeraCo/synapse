#!/usr/bin/env npx tsx
// scripts/discord-bot.ts - Standalone Discord bot runner
// Run with: npx tsx scripts/discord-bot.ts

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
  console.log("[discord-bot] Loaded .env.local");
} catch (e) { console.error("[discord-bot] Failed to load .env.local:", e); }

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
