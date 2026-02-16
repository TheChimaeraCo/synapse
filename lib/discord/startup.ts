// lib/discord/startup.ts - Bot lifecycle management (singleton)
import { Client } from "discord.js";
import { createDiscordBot, type DiscordBotConfig } from "./bot";
import { getDiscordToken, getDiscordChannelIds } from "./config";

const CONVEX_URL = process.env.CONVEX_URL || process.env.CONVEX_SELF_HOSTED_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3220";
const ADMIN_KEY = process.env.CONVEX_ADMIN_KEY || process.env.CONVEX_SELF_HOSTED_ADMIN_KEY || "";

let clientInstance: Client | null = null;
let started = false;
let startTime: number | null = null;

export async function startDiscordBot(gatewayId?: string): Promise<void> {
  if (started) {
    console.warn("[discord] Bot already started");
    return;
  }

  let token: string;
  try {
    token = await getDiscordToken(gatewayId);
  } catch {
    console.log("[discord] No bot token configured, skipping startup");
    return;
  }

  const allowedChannelIds = await getDiscordChannelIds(gatewayId);
  console.log(`[discord] Starting bot... Allowed channels: ${allowedChannelIds.length > 0 ? allowedChannelIds.join(", ") : "all"}`);

  const config: DiscordBotConfig = {
    token,
    convexUrl: CONVEX_URL,
    adminKey: ADMIN_KEY,
    gatewayId,
    allowedChannelIds: allowedChannelIds.length > 0 ? allowedChannelIds : undefined,
  };

  clientInstance = createDiscordBot(config);
  await clientInstance.login(token);
  started = true;
  startTime = Date.now();
  console.log("[discord] Bot started successfully");
}

export async function stopDiscordBot(): Promise<void> {
  if (!started || !clientInstance) return;
  console.log("[discord] Stopping bot...");
  clientInstance.destroy();
  clientInstance = null;
  started = false;
  startTime = null;
  console.log("[discord] Bot stopped");
}

export function getDiscordBotStatus() {
  return {
    started,
    running: started && clientInstance !== null,
    uptime: startTime ? Date.now() - startTime : null,
  };
}

export { clientInstance };
