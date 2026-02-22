// lib/whatsapp/send.ts - Send messages via WhatsApp Cloud API
import { normalizeChunkMode, splitMessageByMode, type ChunkMode } from "@/lib/messageFormatting";

const GRAPH_API = "https://graph.facebook.com/v21.0";
const MAX_TEXT_LENGTH = 4096;

/**
 * Split text into chunks at newline boundaries, respecting WhatsApp's 4096 char limit.
 */
export function splitMessage(text: string, maxLen = MAX_TEXT_LENGTH, mode: ChunkMode = "newline"): string[] {
  return splitMessageByMode(text, maxLen, normalizeChunkMode(mode));
}

/**
 * Send a text message via WhatsApp Cloud API.
 */
export async function sendTextMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string,
  opts?: { chunkLimit?: number; chunkMode?: ChunkMode | string }
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const chunkLimit = opts?.chunkLimit && opts.chunkLimit > 0
    ? Math.min(opts.chunkLimit, MAX_TEXT_LENGTH)
    : MAX_TEXT_LENGTH;
  const chunks = splitMessage(text, chunkLimit, normalizeChunkMode(opts?.chunkMode));
  let lastMessageId: string | undefined;

  for (const chunk of chunks) {
    const res = await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: chunk },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[whatsapp] Send failed:", data);
      return { ok: false, error: data.error?.message || "Send failed" };
    }

    lastMessageId = data.messages?.[0]?.id;
  }

  return { ok: true, messageId: lastMessageId };
}

/**
 * Mark a message as read.
 */
export async function markAsRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<void> {
  await fetch(`${GRAPH_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  }).catch(() => {});
}
