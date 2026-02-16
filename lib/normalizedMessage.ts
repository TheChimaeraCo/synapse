// Stub for Telegram message normalization
export interface NormalizedMessage {
  text: string;
  chatId: string | number;
  userId: string | number;
  userName?: string;
  replyToMessageId?: number;
  isGroupChat?: boolean;
}

export function parseTelegram(update: any): NormalizedMessage | null {
  const msg = update?.message || update?.edited_message;
  if (!msg) return null;
  return {
    text: msg.text || msg.caption || "",
    chatId: msg.chat?.id,
    userId: msg.from?.id,
    userName: msg.from?.first_name || msg.from?.username || "Unknown",
    replyToMessageId: msg.reply_to_message?.message_id,
    isGroupChat: msg.chat?.type !== "private",
  };
}
