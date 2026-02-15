"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

// Shared send utilities - standalone functions using fetch() directly
// These work identically in both the bot process and Convex actions.
// Note: We inline the core logic here since Convex bundling can't import from lib/
// but the logic matches lib/telegram/send.ts exactly.

const TELEGRAM_API = "https://api.telegram.org";
const PARSE_ERR_RE = /can't parse entities|parse entities|find end of the entity/i;

async function telegramApi(token: string, method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

function splitMessage(text: string, maxLen = 4096): string[] {
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

async function getToken(ctx: any): Promise<string> {
  const token = await ctx.runQuery(internal.functions.config.getInternal, { key: "telegram_bot_token" })
    || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  return token;
}

export const sendMessage = internalAction({
  args: {
    chatId: v.string(),
    text: v.string(),
    replyToMessageId: v.optional(v.number()),
    parseMode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const token = await getToken(ctx);
    const chunks = splitMessage(args.text);
    let lastMessageId: number | undefined;

    for (let i = 0; i < chunks.length; i++) {
      const body: Record<string, unknown> = {
        chat_id: args.chatId,
        text: chunks[i],
        parse_mode: args.parseMode || "Markdown",
      };
      if (i === 0 && args.replyToMessageId) {
        body.reply_to_message_id = args.replyToMessageId;
      }

      const result = await telegramApi(token, "sendMessage", body);
      if (result.ok && result.result) {
        lastMessageId = (result.result as Record<string, unknown>).message_id as number;
      }

      if (!result.ok && PARSE_ERR_RE.test(result.description as string || "")) {
        delete body.parse_mode;
        const retry = await telegramApi(token, "sendMessage", body);
        if (retry.ok && retry.result) {
          lastMessageId = (retry.result as Record<string, unknown>).message_id as number;
        }
      }
    }

    return { ok: true, messageId: lastMessageId };
  },
});

export const sendTypingAction = internalAction({
  args: {
    chatId: v.string(),
  },
  handler: async (ctx, args) => {
    const token = await getToken(ctx);
    await telegramApi(token, "sendChatAction", {
      chat_id: args.chatId,
      action: "typing",
    });
  },
});

export const sendPhoto = internalAction({
  args: {
    chatId: v.string(),
    photoUrl: v.string(),
    caption: v.optional(v.string()),
    replyToMessageId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const token = await getToken(ctx);
    const body: Record<string, unknown> = {
      chat_id: args.chatId,
      photo: args.photoUrl,
    };
    if (args.caption) body.caption = args.caption;
    if (args.replyToMessageId) body.reply_to_message_id = args.replyToMessageId;

    const result = await telegramApi(token, "sendPhoto", body);
    return { ok: !!result.ok };
  },
});

export const sendDocument = internalAction({
  args: {
    chatId: v.string(),
    documentUrl: v.string(),
    caption: v.optional(v.string()),
    replyToMessageId: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const token = await getToken(ctx);
    const body: Record<string, unknown> = {
      chat_id: args.chatId,
      document: args.documentUrl,
    };
    if (args.caption) body.caption = args.caption;
    if (args.replyToMessageId) body.reply_to_message_id = args.replyToMessageId;

    const result = await telegramApi(token, "sendDocument", body);
    return { ok: !!result.ok };
  },
});

export const editMessage = internalAction({
  args: {
    chatId: v.string(),
    messageId: v.number(),
    text: v.string(),
    parseMode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const token = await getToken(ctx);
    const body: Record<string, unknown> = {
      chat_id: args.chatId,
      message_id: args.messageId,
      text: args.text,
      parse_mode: args.parseMode || "Markdown",
    };

    const result = await telegramApi(token, "editMessageText", body);

    if (!result.ok && PARSE_ERR_RE.test(result.description as string || "")) {
      delete body.parse_mode;
      const retry = await telegramApi(token, "editMessageText", body);
      return { ok: !!retry.ok };
    }

    return { ok: !!result.ok };
  },
});
