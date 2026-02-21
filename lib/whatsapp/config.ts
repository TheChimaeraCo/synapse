// lib/whatsapp/config.ts - Configuration loader for WhatsApp Cloud API
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
    console.error(`[whatsapp] Failed to fetch config "${key}":`, err);
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
    console.error(`[whatsapp] Failed to fetch gateway config "${key}":`, err);
    return null;
  }
}

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  appSecret?: string;
}

export async function getWhatsAppConfig(gatewayId?: string): Promise<WhatsAppConfig | null> {
  const keys = ["whatsapp_phone_number_id", "whatsapp_access_token", "whatsapp_verify_token", "whatsapp_app_secret"];
  const values: Record<string, string | null> = {};

  for (const key of keys) {
    if (gatewayId) {
      values[key] = await getGatewayConfig(gatewayId, key);
    }
    if (!values[key]) {
      values[key] = await getConfig(key);
    }
  }

  const phoneNumberId = values.whatsapp_phone_number_id;
  const accessToken = values.whatsapp_access_token;
  const verifyToken = values.whatsapp_verify_token;

  if (!phoneNumberId || !accessToken || !verifyToken) return null;

  return {
    phoneNumberId,
    accessToken,
    verifyToken,
    appSecret: values.whatsapp_app_secret || undefined,
  };
}

export { getClient };
