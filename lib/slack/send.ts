// lib/slack/send.ts - Send messages via Slack Web API
import { WebClient } from "@slack/web-api";
import { normalizeChunkMode, splitMessageByMode, type ChunkMode } from "@/lib/messageFormatting";

const MAX_TEXT_LENGTH = 4000;

/**
 * Split text into chunks at newline boundaries, respecting Slack's ~4000 char limit.
 */
export function splitMessage(text: string, maxLen = MAX_TEXT_LENGTH, mode: ChunkMode = "newline"): string[] {
  return splitMessageByMode(text, maxLen, normalizeChunkMode(mode));
}

/**
 * Send a text message to a Slack channel or DM.
 */
export async function sendTextMessage(
  botToken: string,
  channel: string,
  text: string,
  threadTs?: string,
  opts?: { chunkLimit?: number; chunkMode?: ChunkMode | string }
): Promise<{ ok: boolean; messageTs?: string; error?: string }> {
  const client = new WebClient(botToken);
  const chunkLimit = opts?.chunkLimit && opts.chunkLimit > 0
    ? Math.min(opts.chunkLimit, MAX_TEXT_LENGTH)
    : MAX_TEXT_LENGTH;
  const chunks = splitMessage(text, chunkLimit, normalizeChunkMode(opts?.chunkMode));
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
