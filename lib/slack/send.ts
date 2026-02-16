// lib/slack/send.ts - Send messages via Slack Web API
import { WebClient } from "@slack/web-api";

const MAX_TEXT_LENGTH = 4000;

/**
 * Split text into chunks at newline boundaries, respecting Slack's ~4000 char limit.
 */
export function splitMessage(text: string, maxLen = MAX_TEXT_LENGTH): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf("\n", maxLen);
    if (splitIdx < maxLen / 2) splitIdx = maxLen;
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx);
  }
  return chunks;
}

/**
 * Send a text message to a Slack channel or DM.
 */
export async function sendTextMessage(
  botToken: string,
  channel: string,
  text: string,
  threadTs?: string
): Promise<{ ok: boolean; messageTs?: string; error?: string }> {
  const client = new WebClient(botToken);
  const chunks = splitMessage(text);
  let lastTs: string | undefined;

  for (const chunk of chunks) {
    try {
      const result = await client.chat.postMessage({
        channel,
        text: chunk,
        thread_ts: threadTs,
      });
      lastTs = result.ts as string;
      // Subsequent chunks reply in the same thread
      if (!threadTs && lastTs) threadTs = lastTs;
    } catch (err: any) {
      console.error("[slack] Send failed:", err.message);
      return { ok: false, error: err.message };
    }
  }

  return { ok: true, messageTs: lastTs };
}
