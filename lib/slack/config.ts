// lib/slack/config.ts - Configuration loader for Slack integration
import { getConfig, getGatewayConfig, getClient } from "../whatsapp/config";

export interface SlackConfig {
  botToken: string;
  signingSecret: string;
  appToken?: string;
  channelIds?: string[];
}

export async function getSlackConfig(gatewayId?: string): Promise<SlackConfig | null> {
  const keys = ["slack_bot_token", "slack_signing_secret", "slack_app_token", "slack_channel_ids"];
  const values: Record<string, string | null> = {};

  for (const key of keys) {
    if (gatewayId) {
      values[key] = await getGatewayConfig(gatewayId, key);
    }
    if (!values[key]) {
      values[key] = await getConfig(key);
    }
  }

  const botToken = values.slack_bot_token;
  const signingSecret = values.slack_signing_secret;

  if (!botToken || !signingSecret) return null;

  const channelIds = values.slack_channel_ids
    ? values.slack_channel_ids.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  return {
    botToken,
    signingSecret,
    appToken: values.slack_app_token || undefined,
    channelIds,
  };
}

export { getConfig, getGatewayConfig, getClient };
