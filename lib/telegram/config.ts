// lib/telegram/config.ts - Configuration loader for Telegram bot
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
    console.error(`[telegram] Failed to fetch config "${key}":`, err);
    return null;
  }
}

export async function getGatewayConfig(gatewayId: string, key: string): Promise<string | null> {
  try {
    const c = getClient();
    const { api } = await import("../../convex/_generated/api");
    const result = await c.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId: gatewayId as any,
      key,
    });
    return result?.value || null;
  } catch (err) {
    console.error(`[telegram] Failed to fetch gateway config "${key}":`, err);
    return null;
  }
}

export async function getTelegramToken(gatewayId?: string): Promise<string> {
  // Try gateway-specific config first
  if (gatewayId) {
    const gwToken = await getGatewayConfig(gatewayId, "telegram_bot_token");
    if (gwToken) return gwToken;
  }
  // Fall back to global config
  const token = await getConfig("telegram_bot_token") || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram bot token not configured");
  return token;
}

export async function getWebhookSecret(): Promise<string | null> {
  return await getConfig("telegram_webhook_secret") || process.env.TELEGRAM_WEBHOOK_SECRET || null;
}

export { getClient };
