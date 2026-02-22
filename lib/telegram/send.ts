// lib/telegram/send.ts - Standalone Telegram message sending utilities
// Used by both the grammY bot process AND Convex actions
import { normalizeChunkMode, splitMessageByMode, type ChunkMode } from "@/lib/messageFormatting";

const TELEGRAM_API = "https://api.telegram.org";
const MAX_TEXT_LENGTH = 4096;
const PARSE_ERR_RE = /can't parse entities|parse entities|find end of the entity/i;

interface SendOptions {
  replyToMessageId?: number;
  parseMode?: string;
  disableNotification?: boolean;
  messageThreadId?: number;
  chunkLimit?: number;
  chunkMode?: ChunkMode | string;
}

async function telegramApi(
  token: string,
  method: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

/**
 * Split text into chunks at newline boundaries, respecting max length.
 */
export function splitMessage(text: string, maxLen = MAX_TEXT_LENGTH, mode: ChunkMode = "newline"): string[] {
  return splitMessageByMode(text, maxLen, normalizeChunkMode(mode));
}

/**
 * Send a text message with automatic chunking and parse error fallback.
 */
export async function sendMessage(
  token: string,
  chatId: string,
  text: string,
  opts: SendOptions = {}
): Promise<{ ok: boolean; messageId?: number }> {
  const chunkLimit = opts.chunkLimit && opts.chunkLimit > 0
    ? Math.min(opts.chunkLimit, MAX_TEXT_LENGTH)
    : MAX_TEXT_LENGTH;
  const chunks = splitMessage(text, chunkLimit, normalizeChunkMode(opts.chunkMode));
  let lastMessageId: number | undefined;

  for (let i = 0; i < chunks.length; i++) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: chunks[i],
      parse_mode: opts.parseMode || "Markdown",
    };
    if (i === 0 && opts.replyToMessageId) {
      body.reply_to_message_id = opts.replyToMessageId;
    }
    if (opts.messageThreadId) {
      body.message_thread_id = opts.messageThreadId;
    }
    if (opts.disableNotification) {
      body.disable_notification = true;
    }

    const result = await telegramApi(token, "sendMessage", body);

    if (result.ok && result.result) {
      lastMessageId = (result.result as Record<string, unknown>).message_id as number;
    }

    // Parse error fallback: retry without parse_mode
    if (!result.ok && PARSE_ERR_RE.test(result.description as string || "")) {
      delete body.parse_mode;
      const retry = await telegramApi(token, "sendMessage", body);
      if (retry.ok && retry.result) {
        lastMessageId = (retry.result as Record<string, unknown>).message_id as number;
      }
    }
  }

  return { ok: true, messageId: lastMessageId };
}

/**
 * Send a photo.
 */
export async function sendPhoto(
  token: string,
  chatId: string,
  photoUrl: string,
  opts: SendOptions & { caption?: string } = {}
): Promise<{ ok: boolean }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    photo: photoUrl,
  };
  if (opts.caption) body.caption = opts.caption;
  if (opts.replyToMessageId) body.reply_to_message_id = opts.replyToMessageId;
  if (opts.messageThreadId) body.message_thread_id = opts.messageThreadId;

  const result = await telegramApi(token, "sendPhoto", body);
  return { ok: !!result.ok };
}

/**
 * Send a document.
 */
export async function sendDocument(
  token: string,
  chatId: string,
  documentUrl: string,
  opts: SendOptions & { caption?: string } = {}
): Promise<{ ok: boolean }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    document: documentUrl,
  };
  if (opts.caption) body.caption = opts.caption;
  if (opts.replyToMessageId) body.reply_to_message_id = opts.replyToMessageId;
  if (opts.messageThreadId) body.message_thread_id = opts.messageThreadId;

  const result = await telegramApi(token, "sendDocument", body);
  return { ok: !!result.ok };
}

/**
 * Send typing indicator.
 */
export async function sendTypingAction(
  token: string,
  chatId: string
): Promise<void> {
  await telegramApi(token, "sendChatAction", {
    chat_id: chatId,
    action: "typing",
  });
}

/**
 * Edit an existing message.
 */
export async function editMessage(
  token: string,
  chatId: string,
  messageId: number,
  text: string,
  opts: { parseMode?: string } = {}
): Promise<{ ok: boolean }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: opts.parseMode || "Markdown",
  };

  const result = await telegramApi(token, "editMessageText", body);

  if (!result.ok && PARSE_ERR_RE.test(result.description as string || "")) {
    delete body.parse_mode;
    const retry = await telegramApi(token, "editMessageText", body);
    return { ok: !!retry.ok };
  }

  return { ok: !!result.ok };
}

/**
 * Send a message with inline keyboard buttons.
 */
export async function sendMessageWithButtons(
  token: string,
  chatId: string,
  text: string,
  buttons: Array<Array<{ text: string; callback_data: string }>>,
  opts: SendOptions = {}
): Promise<{ ok: boolean; messageId?: number }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: buttons },
  };
  if (opts.replyToMessageId) body.reply_to_message_id = opts.replyToMessageId;
  if (opts.messageThreadId) body.message_thread_id = opts.messageThreadId;

  const result = await telegramApi(token, "sendMessage", body);
  const messageId = result.ok
    ? ((result.result as Record<string, unknown>).message_id as number)
    : undefined;
  return { ok: !!result.ok, messageId };
}

/**
 * Download a file from Telegram by file_id.
 */
export async function downloadFile(
  token: string,
  fileId: string
): Promise<{ buffer: ArrayBuffer; filePath: string } | null> {
  const fileInfoRes = await fetch(`${TELEGRAM_API}/bot${token}/getFile?file_id=${fileId}`);
  const fileInfo = await fileInfoRes.json();
  if (!fileInfo.ok || !fileInfo.result?.file_path) return null;

  const filePath = fileInfo.result.file_path;
  const fileUrl = `${TELEGRAM_API}/file/bot${token}/${filePath}`;
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) return null;

  return { buffer: await fileRes.arrayBuffer(), filePath };
}
