// lib/normalizedMessage.ts - Platform-agnostic message normalization
import type { TelegramUpdate, NormalizedInbound } from "./types";

export function parseTelegram(payload: TelegramUpdate): NormalizedInbound {
  const msg = payload.message!;

  let text = msg.text || msg.caption || "";
  const attachments: Array<{ type: string; fileId: string; filename?: string; mimeType?: string }> = [];

  // Handle photos (array of sizes, take largest)
  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    attachments.push({ type: "photo", fileId: largest.file_id });
  }

  // Handle documents
  if (msg.document) {
    attachments.push({
      type: "document",
      fileId: msg.document.file_id,
      filename: msg.document.file_name,
      mimeType: msg.document.mime_type,
    });
  }

  // Handle voice
  if (msg.voice) {
    attachments.push({
      type: "voice",
      fileId: msg.voice.file_id,
      mimeType: msg.voice.mime_type || "audio/ogg",
    });
  }

  return {
    platform: "telegram",
    externalUserId: String(msg.from!.id),
    externalChatId: String(msg.chat.id),
    externalMessageId: String(msg.message_id),
    displayName:
      msg.from!.first_name +
      (msg.from!.last_name ? ` ${msg.from!.last_name}` : ""),
    text,
    isGroup: msg.chat.type !== "private",
    timestamp: msg.date * 1000,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

export function parseHub(payload: {
  userId: string;
  displayName: string;
  content: string;
  sessionId: string;
}): NormalizedInbound {
  return {
    platform: "hub",
    externalUserId: payload.userId,
    externalChatId: payload.sessionId,
    externalMessageId: `hub-${Date.now()}`,
    displayName: payload.displayName,
    text: payload.content,
    isGroup: false,
    timestamp: Date.now(),
  };
}
