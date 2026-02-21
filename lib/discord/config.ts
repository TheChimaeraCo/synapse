// lib/discord/config.ts - Configuration loader for Discord bot
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

const CONVEX_URL = process.env.CONVEX_URL || process.env.CONVEX_SELF_HOSTED_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3220";

let client: ConvexHttpClient | null = null;

function getClient(): ConvexHttpClient {
  if (!client) {
    client = new ConvexHttpClient(CONVEX_URL);
    const adminKey = process.env.CONVEX_ADMIN_KEY || process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
    if (adminKey) {
      (client as any).setAdminAuth(adminKey);
    }
  }
  return client;
}

export async function getConfig(key: string): Promise<string | null> {
  try {
    const c = getClient();
    const value = await c.query(api.functions.config.get, { key });
    return value || null;
  } catch (err) {
    console.error(`[discord] Failed to fetch config "${key}":`, err);
    return null;
  }
}

export async function getGatewayConfig(gatewayId: string, key: string): Promise<string | null> {
  try {
    const c = getClient();
    const result = await c.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId: gatewayId as any,
      key,
    });
    return result?.value || null;
  } catch (err) {
    console.error(`[discord] Failed to fetch gateway config "${key}":`, err);
    return null;
  }
}

export async function getDiscordToken(gatewayId?: string): Promise<string> {
  if (gatewayId) {
    const gwToken = await getGatewayConfig(gatewayId, "discord_bot_token");
    if (gwToken) return gwToken;
  }
  const token = await getConfig("discord_bot_token") || process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Discord bot token not configured");
  return token;
}

export async function getDiscordChannelIds(gatewayId?: string): Promise<string[]> {
  let raw: string | null = null;
  if (gatewayId) {
    raw = await getGatewayConfig(gatewayId, "discord_channel_ids");
  }
  if (!raw) {
    raw = await getConfig("discord_channel_ids") || process.env.DISCORD_CHANNEL_IDS || "";
  }
  if (!raw) return [];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

export { getClient };
