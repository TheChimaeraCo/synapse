export interface NormalizedMessage {
  text: string;
  externalChatId: string;
  externalUserId: string;
  externalMessageId: string;
  displayName: string;
  timestamp: number;
  isGroup: boolean;
  replyToMessageId?: number;
  attachments?: Array<{
    type: "photo" | "document" | "voice";
    fileId: string;
    filename?: string;
    mimeType?: string;
  }>;
}

export function parseTelegram(update: any): NormalizedMessage | null {
  const msg = update?.message || update?.edited_message;
  if (!msg) return null;

  const attachments: NormalizedMessage["attachments"] = [];
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    if (largest?.file_id) {
      attachments.push({
        type: "photo",
        fileId: largest.file_id,
      });
    }
  }
  if (msg.document?.file_id) {
    attachments.push({
      type: "document",
      fileId: msg.document.file_id,
      filename: msg.document.file_name,
      mimeType: msg.document.mime_type,
    });
  }
  if (msg.voice?.file_id) {
    attachments.push({
      type: "voice",
      fileId: msg.voice.file_id,
      filename: "voice.ogg",
      mimeType: msg.voice.mime_type,
    });
  }

  return {
    text: msg.text || msg.caption || "",
    externalChatId: String(msg.chat?.id ?? ""),
    externalUserId: String(msg.from?.id ?? ""),
    externalMessageId: String(msg.message_id ?? ""),
    displayName: msg.from?.first_name || msg.from?.username || "Unknown",
    timestamp: (msg.date ?? Math.floor(Date.now() / 1000)) * 1000,
    isGroup: msg.chat?.type !== "private",
    replyToMessageId: msg.reply_to_message?.message_id,
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}
