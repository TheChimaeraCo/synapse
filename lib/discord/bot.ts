// lib/discord/bot.ts - Discord.js bot with message handler
import { Client, GatewayIntentBits, Message, Partials } from "discord.js";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { splitMessage } from "./send";
import { executeTools, toProviderTools } from "../toolExecutor";
import { BUILTIN_TOOLS } from "../builtinTools";

// --- Deduplication ---
const DEDUP_TTL_MS = 5 * 60 * 1000;
const DEDUP_MAX_SIZE = 2000;
const recentMessages = new Map<string, number>();

function dedupCheck(messageId: string): boolean {
  const now = Date.now();
  if (recentMessages.size > DEDUP_MAX_SIZE) {
    for (const [k, ts] of recentMessages) {
      if (now - ts > DEDUP_TTL_MS) recentMessages.delete(k);
    }
  }
  if (recentMessages.has(messageId)) return true;
  recentMessages.set(messageId, now);
  return false;
}

export interface DiscordBotConfig {
  token: string;
  convexUrl: string;
  adminKey?: string;
  gatewayId?: string;
  allowedChannelIds?: string[];
}

export function createDiscordBot(config: DiscordBotConfig): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel], // needed for DMs
  });

  const convex = new ConvexHttpClient(config.convexUrl);
  if (config.adminKey) {
    (convex as any).setAdminAuth(config.adminKey);
  }
  console.log(`[discord] Convex URL: ${config.convexUrl}`);

  client.once("ready", (c) => {
    console.log(`[discord] Bot logged in as ${c.user.tag}`);
  });

  client.on("messageCreate", async (msg: Message) => {
    try {
      // Ignore bot messages
      if (msg.author.bot) return;
      if (dedupCheck(msg.id)) return;

      const text = msg.content;
      if (!text) return;

      // Check if message is in an allowed channel (if configured)
      const isDM = !msg.guild;
      if (!isDM && config.allowedChannelIds && config.allowedChannelIds.length > 0) {
        if (!config.allowedChannelIds.includes(msg.channel.id)) return;
      }

      const userId = msg.author.id;
      const displayName = msg.member?.displayName || msg.author.displayName || msg.author.username;
      const username = msg.author.username;

      console.log(`[discord] Message from ${displayName} (${userId}): ${text.slice(0, 80)}`);

      // Send typing indicator
      if ("sendTyping" in msg.channel && typeof (msg.channel as any).sendTyping === "function") {
        await (msg.channel as any).sendTyping().catch(() => {});
      }

      // Find discord channel doc
      const channelDoc = await convex.query(api.functions.channels.findByPlatform, {
        platform: "discord",
      }).catch((e: any) => {
        console.error("[discord] Failed to find channel:", e);
        return null;
      });

      if (!channelDoc) {
        console.error("[discord] No discord channel found in Convex");
        await msg.reply("Bot not fully configured. Please set up a Discord channel in Synapse settings.").catch(() => {});
        return;
      }

      const gatewayId = channelDoc.gatewayId as Id<"gateways">;
      const agentId = channelDoc.agentId as Id<"agents">;

      // Upsert channel user
      try {
        await convex.mutation(api.functions.channels.upsertChannelUser, {
          channelId: channelDoc._id,
          externalUserId: `discord:${userId}`,
          displayName,
          isBot: false,
        });
      } catch {}

      // Find or create session
      const sessionId = await convex.mutation(api.functions.sessions.findOrCreate, {
        gatewayId,
        agentId,
        channelId: channelDoc._id,
        externalUserId: `discord:${userId}`,
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
        console.log(`[discord] Resolved conversation: ${conversationId}`);
      } catch (err) {
        console.error("[discord] Failed to resolve conversation:", err);
      }

      // Store user message
      const userMessageId = await convex.mutation(api.functions.messages.create, {
        gatewayId,
        sessionId,
        agentId,
        role: "user",
        content: text,
        channelMessageId: msg.id,
        conversationId,
      });

      // Check budget
      const budget = await convex.query(api.functions.usage.checkBudget, { gatewayId });
      if (!budget.allowed) {
        await msg.reply("Usage limit reached. Please try again later.").catch(() => {});
        return;
      }

      // Create activeRun
      const runId = await convex.mutation(api.functions.activeRuns.create, {
        gatewayId,
        sessionId,
        status: "thinking",
      });

      try {
        const agent = await convex.query(api.functions.agents.get, { id: agentId });
        if (!agent) throw new Error("Agent not found");

        // Get AI config
        let providerSlug: string | null, apiKey: string | null, configModel: string | null;
        if (config.gatewayId) {
          const { getGatewayConfig } = await import("./config");
          [providerSlug, apiKey, configModel] = await Promise.all([
            getGatewayConfig(config.gatewayId, "ai_provider"),
            getGatewayConfig(config.gatewayId, "ai_api_key"),
            getGatewayConfig(config.gatewayId, "ai_model"),
          ]);
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

        // Build context
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
          console.warn("[discord] buildContext failed, using fallback:", e);
          const recentMessages = await convex.query(api.functions.messages.getRecent, {
            sessionId,
            limit: 15,
          });
          claudeMessages = recentMessages
            .map((m: any) => ({ role: m.role, content: m.content }))
            .filter((m: any) => m.role === "user" || m.role === "assistant");
          systemPrompt = agent.systemPrompt || "You are a helpful assistant.";
        }

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

        await convex.mutation(api.functions.activeRuns.updateStatus, {
          id: runId,
          status: "streaming",
        });

        // Keep typing while processing
        const typingInterval = setInterval(() => {
          if ("sendTyping" in msg.channel && typeof (msg.channel as any).sendTyping === "function") {
            (msg.channel as any).sendTyping().catch(() => {});
          }
        }, 8000);

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
              console.log(`[discord] Tool requested conversation switch -> ${responseConversationId}`);
              if (!movedUserMessageToNewConversation) {
                try {
                  await convex.mutation(api.functions.messages.updateConversationId, {
                    id: userMessageId as Id<"messages">,
                    conversationId: responseConversationId,
                  });
                  movedUserMessageToNewConversation = true;
                } catch (err) {
                  console.error("[discord] Failed to move triggering user message:", err);
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

        // Send to Discord (chunked)
        const chunks = splitMessage(fullContent);
        for (const chunk of chunks) {
          await msg.reply(chunk).catch((e) => {
            console.error("[discord] Failed to send chunk:", e);
          });
        }

        // Complete run
        await convex.mutation(api.functions.activeRuns.complete, { id: runId });

        console.log(`[discord] Response sent (${latencyMs}ms, ${usage.input}+${usage.output} tokens)`);

        // Push notification
        try {
          const { sendPushToAll } = await import("../pushService");
          const preview = fullContent.length > 100 ? fullContent.slice(0, 100) + "..." : fullContent;
          await sendPushToAll({ title: "Synapse - New Message", body: preview, url: "/chat" });
        } catch {}

      } catch (aiErr: any) {
        console.error("[discord] AI processing error:", aiErr);
        await convex.mutation(api.functions.activeRuns.updateStatus, {
          id: runId,
          status: "error",
          error: aiErr.message || "Unknown error",
        });
        await msg.reply("Sorry, I encountered an error processing your message.").catch(() => {});
      }

    } catch (err: any) {
      console.error("[discord] Message handler error:", err?.message || err);
      try {
        await msg.reply("Sorry, something went wrong. Please try again.");
      } catch {}
    }
  });

  return client;
}
