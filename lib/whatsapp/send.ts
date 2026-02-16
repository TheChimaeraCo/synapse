// lib/whatsapp/send.ts - Send messages via WhatsApp Cloud API

const GRAPH_API = "https://graph.facebook.com/v21.0";
const MAX_TEXT_LENGTH = 4096;

/**
 * Split text into chunks at newline boundaries, respecting WhatsApp's 4096 char limit.
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
 * Send a text message via WhatsApp Cloud API.
 */
export async function sendTextMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const chunks = splitMessage(text);
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
