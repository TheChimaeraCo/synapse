// lib/telegram/bot.ts - Main grammY bot module
import { Bot, Context } from "grammy";
import { sequentialize } from "@grammyjs/runner";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sendMessage, sendMessageWithButtons, sendTypingAction } from "./send";
import { executeTools, toProviderTools } from "../toolExecutor";
import { BUILTIN_TOOLS } from "../builtinTools";

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

      const chatId = String(msg.chat.id);
      const userId = String(msg.from!.id);
      const displayName = msg.from!.first_name + (msg.from!.last_name ? ` ${msg.from!.last_name}` : "");
      const username = msg.from!.username;
      const text = msg.text || msg.caption || "[media]";

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
      try {
        const { resolveConversation } = await import("@/lib/conversationManager");
        conversationId = await resolveConversation(
          sessionId as Id<"sessions">,
          gatewayId as Id<"gateways">,
          undefined,
          text
        );
        console.log(`[telegram] Resolved conversation: ${conversationId}`);
      } catch (err) {
        console.error("[telegram] Failed to resolve conversation:", err);
      }

      // Store user message
      const userMessageId = await convex.mutation(api.functions.messages.create, {
        gatewayId,
        sessionId,
        agentId,
        role: "user",
        content: text,
        channelMessageId: String(msg.message_id),
        conversationId,
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

      // Process AI response server-side (same as web chat - Convex actions can't reliably fetch in self-hosted)
      try {
        const agent = await convex.query(api.functions.agents.get, { id: agentId });
        if (!agent) throw new Error("Agent not found");

        // Get AI config (gateway-specific with inheritance, or global fallback)
        let providerSlug: string | null, apiKey: string | null, configModel: string | null;
        if (config.gatewayId) {
          const { getGatewayConfig } = await import("./config");
          [providerSlug, apiKey, configModel] = await Promise.all([
            getGatewayConfig(config.gatewayId, "ai_provider"),
            getGatewayConfig(config.gatewayId, "ai_api_key"),
            getGatewayConfig(config.gatewayId, "ai_model"),
          ]);
          // Fall back to global if gateway has no config
          if (!providerSlug) providerSlug = await convex.query(api.functions.config.get, { key: "ai_provider" });
          if (!apiKey) apiKey = await convex.query(api.functions.config.get, { key: "ai_api_key" });
          if (!configModel) configModel = await convex.query(api.functions.config.get, { key: "ai_model" });
        } else {
          [providerSlug, apiKey, configModel] = await Promise.all([
            convex.query(api.functions.config.get, { key: "ai_provider" }),
            convex.query(api.functions.config.get, { key: "ai_api_key" }),
            convex.query(api.functions.config.get, { key: "ai_model" }),
          ]);
        }

        const provider = providerSlug || "anthropic";
        const { getProviderApiKey, hydrateProviderEnv } = await import("../providerSecrets");
        const key = apiKey || getProviderApiKey(provider) || "";
        if (!key) throw new Error("No API key configured");

        hydrateProviderEnv(provider, key);

        const { registerBuiltInApiProviders, getModel, streamSimple } = await import("@mariozechner/pi-ai");
        registerBuiltInApiProviders();

        const modelId = agent.model || configModel || "claude-sonnet-4-20250514";
        const model = getModel(provider as any, modelId as any);
        if (!model) throw new Error(`Model "${modelId}" not found`);

        const enabledTools = await convex.query(api.functions.tools.getEnabled, { gatewayId });
        const builtinToolDefs = BUILTIN_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        }));
        const dbToolNames = new Set(enabledTools.map((t: any) => t.name));
        const allToolDefs = [
          ...builtinToolDefs.filter((t) => !dbToolNames.has(t.name)),
          ...enabledTools,
        ];
        const providerTools = toProviderTools(allToolDefs as any);

        // Build full context (soul, knowledge, memory, messages - same as web chat)
        let systemPrompt: string;
        let claudeMessages: Array<{ role: "user" | "assistant"; content: string }>;
        let responseConversationId = conversationId;
        let movedUserMessageToNewConversation = false;
        try {
          const { buildContext } = await import("../contextBuilder");
          const ctx = await buildContext(sessionId, agentId, text, 5000, responseConversationId);
          systemPrompt = ctx.systemPrompt;
          claudeMessages = ctx.messages;
        } catch (e) {
          console.warn("[telegram] buildContext failed, using fallback:", e);
          // Fallback: basic messages only
          const recentMessages = await convex.query(api.functions.messages.getRecent, {
            sessionId,
            limit: 15,
          });
          claudeMessages = recentMessages
            .map((m: any) => ({ role: m.role, content: m.content }))
            .filter((m: any) => m.role === "user" || m.role === "assistant");
          systemPrompt = agent.systemPrompt || "You are a helpful assistant.";
        }

        // Build context for pi-ai
        const context: any = {
          systemPrompt,
          messages: claudeMessages.map((m: any) =>
            m.role === "user"
              ? { role: "user" as const, content: m.content, timestamp: Date.now() }
              : { role: "assistant" as const, content: [{ type: "text" as const, text: m.content }], timestamp: Date.now() }
          ),
          ...(providerTools ? { tools: providerTools } : {}),
        };

        const options: any = { maxTokens: agent.maxTokens || 4096, apiKey: key };
        if (agent.temperature !== undefined) options.temperature = agent.temperature;

        // Update to streaming
        await convex.mutation(api.functions.activeRuns.updateStatus, {
          id: runId,
          status: "streaming",
        });

        // Keep sending typing while processing
        const typingInterval = setInterval(() => {
          sendTypingAction(config.token, chatId).catch(() => {});
        }, 4000);

        const startMs = Date.now();
        let fullContent = "";
        let usage = { input: 0, output: 0 };
        const MAX_TOOL_ROUNDS = 5;

        try {
          for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
            const toolCalls: any[] = [];
            let roundText = "";
            const stream = streamSimple(model, context, options);
            for await (const event of stream) {
              if (event.type === "text_delta") {
                roundText += event.delta;
              } else if (event.type === "toolcall_end") {
                toolCalls.push(event.toolCall);
              } else if (event.type === "done") {
                usage.input += event.message.usage.input;
                usage.output += event.message.usage.output;
                context.messages.push(event.message);
              }
            }
            fullContent += roundText;
            if (toolCalls.length === 0) break;

            const toolContext = {
              gatewayId: gatewayId as string,
              agentId: agentId as string,
              sessionId: sessionId as string,
              userRole: "viewer",
            };
            const toolResults = await executeTools(toolCalls, toolContext, allToolDefs as any);
            const switchedConvoId = (toolContext as any).__newConversationId as Id<"conversations"> | undefined;
            if (switchedConvoId) {
              responseConversationId = switchedConvoId;
              delete (toolContext as any).__newConversationId;
              console.log(`[telegram] Tool requested conversation switch -> ${responseConversationId}`);
              if (!movedUserMessageToNewConversation) {
                try {
                  await convex.mutation(api.functions.messages.updateConversationId, {
                    id: userMessageId as Id<"messages">,
                    conversationId: responseConversationId,
                  });
                  movedUserMessageToNewConversation = true;
                } catch (err) {
                  console.error("[telegram] Failed to move triggering user message:", err);
                }
              }
            }

            for (const result of toolResults) {
              context.messages.push({
                role: "toolResult" as const,
                toolCallId: result.toolCallId,
                toolName: result.toolName,
                content: [{ type: "text" as const, text: result.content }],
                isError: result.isError,
                timestamp: Date.now(),
              });
            }
          }
        } finally {
          clearInterval(typingInterval);
        }

        const latencyMs = Date.now() - startMs;

        const MODEL_COSTS: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
          "claude-sonnet-4-20250514": { inputPerMillion: 3, outputPerMillion: 15 },
          "claude-opus-4-20250514": { inputPerMillion: 15, outputPerMillion: 75 },
          "claude-haiku-3-20250514": { inputPerMillion: 0.25, outputPerMillion: 1.25 },
        };
        const costs = MODEL_COSTS[modelId] || { inputPerMillion: 3, outputPerMillion: 15 };
        const cost = (usage.input / 1_000_000 * costs.inputPerMillion) + (usage.output / 1_000_000 * costs.outputPerMillion);

        // Store assistant message
        const msgId = await convex.mutation(api.functions.messages.create, {
          gatewayId,
          sessionId,
          agentId,
          role: "assistant",
          content: fullContent,
          tokens: usage,
          cost,
          model: modelId,
          latencyMs,
          conversationId: responseConversationId,
        });

        // Record usage
        await convex.mutation(api.functions.usage.record, {
          gatewayId,
          agentId,
          sessionId,
          messageId: msgId,
          model: modelId,
          inputTokens: usage.input,
          outputTokens: usage.output,
          cost,
        });

        // Send to Telegram
        await sendMessage(config.token, chatId, fullContent, {
          replyToMessageId: msg.message_id,
        });

        // Complete run
        await convex.mutation(api.functions.activeRuns.complete, { id: runId });

        console.log(`[telegram] Response sent (${latencyMs}ms, ${usage.input}+${usage.output} tokens)`);

        // Send push notification to web subscribers
        try {
          const { sendPushToAll } = await import("../pushService");
          const preview = fullContent.length > 100 ? fullContent.slice(0, 100) + "..." : fullContent;
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
