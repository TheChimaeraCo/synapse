// lib/telegram/bot.ts - Main grammY bot module
import { Bot, Context } from "grammy";
import { sequentialize } from "@grammyjs/runner";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sendMessage, sendTypingAction } from "./send";
import { normalizeChunkMode, parseChunkLimit } from "@/lib/messageFormatting";
import { parseTelegram } from "@/lib/normalizedMessage";
import { createTelegramAttachmentResolver } from "@/lib/agent-sdk/telegram";
import { ingestInboundAttachments, mergeContentWithFileRefs } from "@/lib/agent-sdk/attachments";
import { runAgentTurn } from "@/lib/agent-sdk/turn";
import { MODEL_COSTS } from "@/lib/types";

// --- Deduplication ---
const DEDUP_TTL_MS = 5 * 60 * 1000;
const DEDUP_MAX_SIZE = 2000;
const recentUpdates = new Map<string, number>();

function dedupCheck(updateId: number): boolean {
  const key = `update:${updateId}`;
  const now = Date.now();
  if (recentUpdates.size > DEDUP_MAX_SIZE) {
    for (const [k, ts] of recentUpdates) {
      if (now - ts > DEDUP_TTL_MS) recentUpdates.delete(k);
    }
  }
  if (recentUpdates.has(key)) return true;
  recentUpdates.set(key, now);
  return false;
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || { inputPerMillion: 3, outputPerMillion: 15 };
  return (inputTokens / 1_000_000 * costs.inputPerMillion) +
    (outputTokens / 1_000_000 * costs.outputPerMillion);
}

// --- Sequentialization ---
function getSequentialKey(ctx: Context): string {
  const chatId = ctx.chat?.id;
  const threadId = ctx.message?.message_thread_id;
  if (chatId && threadId) return `telegram:${chatId}:topic:${threadId}`;
  if (chatId) return `telegram:${chatId}`;
  return "telegram:unknown";
}

// --- Bot creation ---
export interface BotConfig {
  token: string;
  convexUrl: string;
  adminKey?: string;
  gatewayId?: string;
}

export function createBot(config: BotConfig): Bot {
  const bot = new Bot(config.token);
  bot.api.config.use(apiThrottler());
  bot.use(sequentialize(getSequentialKey));
  bot.catch((err) => {
    console.error("[telegram] Bot error:", err.message || err);
  });

  // Convex client (public API - same pattern as web chat)
  const convex = new ConvexHttpClient(config.convexUrl);
  console.log(`[telegram] Convex URL: ${config.convexUrl}`);

  // --- Raw update logger ---
  bot.use(async (ctx, next) => {
    console.log(`[telegram] Update received: ${ctx.update.update_id} type=${Object.keys(ctx.update).filter(k => k !== 'update_id').join(',')}`);
    await next();
  });

  // --- Message handler ---
  bot.on("message", async (ctx) => {
    try {
      const msg = ctx.message;
      if (!msg) return;
      if (dedupCheck(ctx.update.update_id)) return;
      if (!msg.text && !msg.caption && !msg.photo && !msg.document && !msg.voice) return;

      const inbound = parseTelegram(ctx.update as any);
      if (!inbound) return;

      const chatId = inbound.externalChatId;
      const userId = inbound.externalUserId;
      const displayName = msg.from!.first_name + (msg.from!.last_name ? ` ${msg.from!.last_name}` : "");
      const username = msg.from!.username;
      const text = inbound.text || "[media]";

      // --- Telegram Auth Check ---
      try {
        const access = await convex.query(api.functions.telegramAuth.checkAccess, {
          telegramId: userId,
        });

        if (access.status === "blocked") {
          console.log(`[telegram] Blocked user ${userId} ignored`);
          return;
        }

        if (access.status === "pending") {
          await sendMessage(config.token, chatId, "Your access request is pending. Please wait for approval.", {
            replyToMessageId: msg.message_id,
          });
          return;
        }

        if (access.status === "unknown") {
          // Create access request
          await convex.mutation(api.functions.telegramAuth.createRequest, {
            telegramId: userId,
            displayName,
            username,
          });

          // Reply to user
          await sendMessage(config.token, chatId, "This bot is private. A request has been sent to the owner for approval. Please wait.", {
            replyToMessageId: msg.message_id,
          });

          // Post system message with action buttons to hub web chat
          try {
            const hubChannel = await convex.query(api.functions.channels.findByPlatform, { platform: "hub" });
            if (hubChannel) {
              const sessions = await convex.query(api.functions.sessions.list, {
                gatewayId: hubChannel.gatewayId,
                status: "active",
                limit: 1,
              }).catch(() => []);
              if (sessions.length > 0) {
                await convex.mutation(api.functions.messages.create, {
                  gatewayId: hubChannel.gatewayId,
                  sessionId: sessions[0]._id,
                  agentId: hubChannel.agentId,
                  role: "system",
                  content: `🔔 New Telegram Access Request\n\n${displayName}${username ? ` (@${username})` : ""}\nTelegram ID: ${userId}`,
                  metadata: {
                    type: "telegram_access_request",
                    telegramId: userId,
                    displayName,
                    username: username || null,
                    actions: [
                      { label: "✅ Approve", action: "approve", variant: "success" },
                      { label: "❌ Block", action: "block", variant: "destructive" },
                    ],
                  },
                });
              }
            }
          } catch (hubErr) {
            console.warn("[telegram] Failed to post access request to hub:", hubErr);
          }

          return;
        }
      } catch (authErr) {
        console.warn("[telegram] Auth check failed, allowing through:", authErr);
        // If auth check fails (e.g. tables don't exist yet), allow through
      }

      // Send typing indicator
      await sendTypingAction(config.token, chatId).catch(() => {});

      // Find telegram channel
      const channelDoc = await convex.query(api.functions.channels.findByPlatform, {
        platform: "telegram",
      }).catch((e: any) => {
        console.error("[telegram] Failed to find channel:", e);
        return null;
      });

      if (!channelDoc) {
        console.error("[telegram] No telegram channel found");
        await sendMessage(config.token, chatId, "Bot not fully configured. Please set up a Telegram channel in Synapse settings.", {});
        return;
      }

      const gatewayId = channelDoc.gatewayId as Id<"gateways">;
      const agentId = channelDoc.agentId as Id<"agents">;

      // Upsert channel user (best effort)
      try {
        await convex.mutation(api.functions.channels.upsertChannelUser, {
          channelId: channelDoc._id,
          externalUserId: `telegram:${userId}`,
          displayName,
          isBot: false,
        });
      } catch {}

      // Find or create session
      const sessionId = await convex.mutation(api.functions.sessions.findOrCreate, {
        gatewayId,
        agentId,
        channelId: channelDoc._id,
        externalUserId: `telegram:${userId}`,
      });

      // Resolve conversation (segmentation)
      let conversationId: Id<"conversations"> | undefined;
      let segmentationMeta:
        | {
          relevanceScore: number;
          splitThreshold: number;
          topicShifted: boolean;
          reason: string;
        }
        | undefined;
      try {
        const { resolveConversation } = await import("@/lib/conversationManager");
        const resolved = await resolveConversation(
          sessionId as Id<"sessions">,
          gatewayId as Id<"gateways">,
          undefined,
          text
        );
        conversationId = resolved.conversationId;
        segmentationMeta = resolved.segmentation;
        console.log(`[telegram] Resolved conversation: ${conversationId}`);
      } catch (err) {
        console.error("[telegram] Failed to resolve conversation:", err);
      }

      // Materialize inbound Telegram attachments into Convex files and reference them in content.
      let messageContent = text.trim();
      if (inbound.attachments && inbound.attachments.length > 0) {
        try {
          const resolver = createTelegramAttachmentResolver(config.token);
          const { files, failed } = await ingestInboundAttachments({
            convex,
            gatewayId,
            sessionId,
            conversationId,
            attachments: inbound.attachments,
            resolveAttachment: resolver,
          });
          messageContent = mergeContentWithFileRefs(messageContent, files);
          if (failed > 0) {
            console.warn(`[telegram] ${failed} attachment(s) failed to ingest for update ${ctx.update.update_id}`);
          }
        } catch (err) {
          console.error("[telegram] Attachment ingestion failed:", err);
        }
      }
      if (!messageContent) messageContent = "[empty message]";

      // Store user message
      const userMessageId = await convex.mutation(api.functions.messages.create, {
        gatewayId,
        sessionId,
        agentId,
        role: "user",
        content: messageContent,
        channelMessageId: String(msg.message_id),
        conversationId,
        ...(segmentationMeta ? { metadata: { segmentation: segmentationMeta } } : {}),
      });

      // Check budget
      const budget = await convex.query(api.functions.usage.checkBudget, { gatewayId });
      if (!budget.allowed) {
        await sendMessage(config.token, chatId, "Usage limit reached. Please try again later.", {
          replyToMessageId: msg.message_id,
        });
        return;
      }

      // Create activeRun
      const runId = await convex.mutation(api.functions.activeRuns.create, {
        gatewayId,
        sessionId,
        status: "thinking",
      });

      // Process AI response via shared Agent SDK turn pipeline.
      try {
        let chunkLimitRaw: string | null = null;
        let chunkModeRaw: string | null = null;
        if (config.gatewayId) {
          const { getGatewayConfig } = await import("./config");
          [chunkLimitRaw, chunkModeRaw] = await Promise.all([
            getGatewayConfig(config.gatewayId, "messages.chunk_limit"),
            getGatewayConfig(config.gatewayId, "messages.chunk_mode"),
          ]);
          if (!chunkLimitRaw) chunkLimitRaw = await convex.query(api.functions.config.get, { key: "messages.chunk_limit" });
          if (!chunkModeRaw) chunkModeRaw = await convex.query(api.functions.config.get, { key: "messages.chunk_mode" });
        } else {
          [chunkLimitRaw, chunkModeRaw] = await Promise.all([
            convex.query(api.functions.config.get, { key: "messages.chunk_limit" }),
            convex.query(api.functions.config.get, { key: "messages.chunk_mode" }),
          ]);
        }

        await convex.mutation(api.functions.activeRuns.updateStatus, {
          id: runId,
          status: "streaming",
        });

        const typingInterval = setInterval(() => {
          sendTypingAction(config.token, chatId).catch(() => {});
        }, 4000);

        let turn;
        try {
          turn = await runAgentTurn({
            convex,
            sessionId,
            gatewayId,
            agentId,
            latestUserMessage: messageContent,
            initialConversationId: conversationId,
            userMessageId: userMessageId as Id<"messages">,
            suggestedModel: budget.suggestedModel || undefined,
            userRole: "viewer",
            maxToolRounds: 5,
          });
        } finally {
          clearInterval(typingInterval);
        }

        const responseConversationId = turn.responseConversationId || conversationId;
        const cost = calculateCost(turn.modelId, turn.usage.input, turn.usage.output);
        const chunkLimit = parseChunkLimit(chunkLimitRaw, 4096);
        const chunkMode = normalizeChunkMode(chunkModeRaw);

        const msgId = await convex.mutation(api.functions.messages.create, {
          gatewayId,
          sessionId,
          agentId,
          role: "assistant",
          content: turn.content,
          tokens: turn.usage,
          cost,
          model: turn.modelId,
          latencyMs: turn.latencyMs,
          conversationId: responseConversationId,
        });

        await convex.mutation(api.functions.usage.record, {
          gatewayId,
          agentId,
          sessionId,
          messageId: msgId,
          model: turn.modelId,
          inputTokens: turn.usage.input,
          outputTokens: turn.usage.output,
          cost,
        });

        await sendMessage(config.token, chatId, turn.content, {
          replyToMessageId: msg.message_id,
          chunkLimit,
          chunkMode,
        });

        await convex.mutation(api.functions.activeRuns.complete, { id: runId });

        console.log(`[telegram] Response sent (${turn.latencyMs}ms, ${turn.usage.input}+${turn.usage.output} tokens)`);

        try {
          const { sendPushToAll } = await import("../pushService");
          const preview = turn.content.length > 100 ? turn.content.slice(0, 100) + "..." : turn.content;
          await sendPushToAll({ title: "Synapse - New Message", body: preview, url: "/chat" });
        } catch (pushErr) {
          console.error("[telegram] Push notification error:", pushErr);
        }

      } catch (aiErr: any) {
        console.error("[telegram] AI processing error:", aiErr);
        await convex.mutation(api.functions.activeRuns.updateStatus, {
          id: runId,
          status: "error",
          error: aiErr.message || "Unknown error",
        });
        await sendMessage(config.token, chatId, "Sorry, I encountered an error processing your message.", {
          replyToMessageId: msg.message_id,
        });
      }

    } catch (err: any) {
      console.error("[telegram] Message handler error:", err?.message || err);
      try {
        await ctx.reply("Sorry, something went wrong. Please try again.");
      } catch {}
    }
  });

  // --- Callback query handler ---
  bot.on("callback_query:data", async (ctx) => {
    try {
      if (dedupCheck(ctx.update.update_id)) return;
      const data = ctx.callbackQuery.data;

      if (data.startsWith("approve:") || data.startsWith("block:")) {
        const [action, targetTelegramId] = data.split(":");

        if (action === "approve") {
          await convex.mutation(api.functions.telegramAuth.approveRequest, { telegramId: targetTelegramId });
          await ctx.answerCallbackQuery({ text: "User approved!" });
          await ctx.editMessageText(`✅ Approved: ${targetTelegramId}`);
          await sendMessage(config.token, targetTelegramId, "You've been approved! How can I help?", {});
        } else {
          await convex.mutation(api.functions.telegramAuth.blockRequest, { telegramId: targetTelegramId });
          await ctx.answerCallbackQuery({ text: "User blocked." });
          await ctx.editMessageText(`❌ Blocked: ${targetTelegramId}`);
          await sendMessage(config.token, targetTelegramId, "Access denied.", {});
        }
        return;
      }

      await ctx.answerCallbackQuery().catch(() => {});
    } catch (err) {
      console.error("[telegram] Callback handler error:", err);
    }
  });

  return bot;
}
