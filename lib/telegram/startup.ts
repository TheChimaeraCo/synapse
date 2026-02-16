// lib/telegram/startup.ts - Bot lifecycle management (singleton)
import { createBot, type BotConfig } from "./bot";
import { startRunner, stopRunner, getRunnerStatus } from "./runner";
import { getTelegramToken } from "./config";
import type { Bot } from "grammy";

let botInstance: Bot | null = null;
let started = false;

const CONVEX_URL = process.env.CONVEX_URL || process.env.CONVEX_SELF_HOSTED_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3220";
const ADMIN_KEY = process.env.CONVEX_ADMIN_KEY || process.env.CONVEX_SELF_HOSTED_ADMIN_KEY || "";

/**
 * Initialize and start the Telegram bot with long polling.
 * If gatewayId is provided, reads config from gateway-specific config.
 */
export async function startTelegramBot(gatewayId?: string): Promise<void> {
  if (started) {
    console.warn("[telegram] Bot already started");
    return;
  }

  try {
    // Check if token is configured before attempting to start
    let token: string;
    try {
      token = await getTelegramToken(gatewayId);
    } catch {
      console.log("[telegram] No bot token configured, skipping startup");
      return;
    }
    console.log("[telegram] Starting bot...");

    const config: BotConfig = {
      token,
      convexUrl: CONVEX_URL,
      adminKey: ADMIN_KEY,
      gatewayId,
    };

    botInstance = createBot(config);

    // Delete any existing webhook before starting long polling
    await botInstance.api.deleteWebhook();
    console.log("[telegram] Webhook deleted (switching to long polling)");

    // Start long polling
    startRunner(botInstance);
    started = true;

    console.log("[telegram] Bot started successfully");
  } catch (err) {
    console.error("[telegram] Failed to start bot:", err);
    throw err;
  }
}

/**
 * Gracefully stop the bot.
 */
export async function stopTelegramBot(): Promise<void> {
  if (!started) return;

  console.log("[telegram] Stopping bot...");
  await stopRunner();
  botInstance = null;
  started = false;
  console.log("[telegram] Bot stopped");
}

/**
 * Get the current bot status.
 */
export function getTelegramBotStatus() {
  const runnerStatus = getRunnerStatus();
  return {
    started,
    ...runnerStatus,
  };
}

export { botInstance };
