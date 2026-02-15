"use node";

import { internalAction, action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import type { TelegramUpdate } from "../../lib/types";
import { MODEL_COSTS } from "../../lib/types";
import { parseTelegram } from "../../lib/normalizedMessage";

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || { inputPerMillion: 3, outputPerMillion: 15 };
  return (inputTokens / 1_000_000 * costs.inputPerMillion) +
         (outputTokens / 1_000_000 * costs.outputPerMillion);
}

export const processInbound = internalAction({
  args: {
    platform: v.literal("telegram"),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const inbound = parseTelegram(args.payload as TelegramUpdate);

    // Find channel (use internal query that doesn't require gatewayId)
    const channel = await ctx.runQuery(internal.functions.channels.findByPlatform, {
      platform: "telegram",
    });
    if (!channel) {
      console.error("No telegram channel configured");
      return;
    }

    // Check if channel is enabled
    if (channel.enabled === false) {
      console.log("Channel disabled, ignoring message");
      return;
    }

    const gatewayId = channel.gatewayId;
    const agentId = channel.agentId;

    // Send typing indicator
    if (channel.typingIndicator !== false) {
      try {
        await ctx.runAction(internal.actions.telegram.sendTypingAction, {
          chatId: inbound.externalChatId,
        });
      } catch {
        // Best effort
      }
    }

    // Track channel user
    try {
      await ctx.runMutation(internal.functions.channels.upsertChannelUser, {
        channelId: channel._id,
        externalUserId: `telegram:${inbound.externalUserId}`,
        displayName: inbound.displayName,
        isBot: false,
      });
    } catch {
      // Best effort
    }

    // Find or create session
    const sessionId = await ctx.runMutation(api.functions.sessions.findOrCreate, {
      gatewayId,
      agentId,
      channelId: channel._id,
      externalUserId: `telegram:${inbound.externalUserId}`,
    });

    // Handle file attachments from Telegram
    let messageContent = inbound.text;
    if (inbound.attachments && inbound.attachments.length > 0) {
      const token = await ctx.runQuery(internal.functions.config.getInternal, { key: "telegram_bot_token" })
        || process.env.TELEGRAM_BOT_TOKEN;
      if (token) {
        for (const att of inbound.attachments) {
          try {
            // Get file path from Telegram
            const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${att.fileId}`);
            const fileInfo = await fileInfoRes.json();
            if (!fileInfo.ok || !fileInfo.result?.file_path) continue;

            // Download file
            const fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`;
            const fileRes = await fetch(fileUrl);
            if (!fileRes.ok) continue;
            const fileBuffer = await fileRes.arrayBuffer();

            // Upload to Convex storage
            const uploadUrl = await ctx.runMutation(api.functions.files.generateUploadUrl);
            const mimeType = att.mimeType || (att.type === "photo" ? "image/jpeg" : "application/octet-stream");
            const uploadRes = await fetch(uploadUrl, {
              method: "POST",
              headers: { "Content-Type": mimeType },
              body: fileBuffer,
            });
            if (!uploadRes.ok) continue;
            const { storageId } = await uploadRes.json();

            const filename = att.filename || (att.type === "photo" ? "photo.jpg" : att.type === "voice" ? "voice.ogg" : "file");
            const fileId = await ctx.runMutation(api.functions.files.create, {
              gatewayId,
              sessionId,
              filename,
              mimeType,
              size: fileBuffer.byteLength,
              storageId,
            });

            messageContent = `[file:${fileId}:${filename}]${messageContent ? "\n" + messageContent : ""}`;
          } catch (e) {
            console.error("Failed to process attachment:", e);
          }
        }
      }
    }

    if (!messageContent) {
      messageContent = "[empty message]";
    }

    // Store user message
    await ctx.runMutation(api.functions.messages.create, {
      gatewayId,
      sessionId,
      agentId,
      role: "user",
      content: messageContent,
      channelMessageId: inbound.externalMessageId,
    });

    // Check budget
    const budget = await ctx.runQuery(api.functions.usage.checkBudget, { gatewayId });
    if (!budget.allowed && "action" in budget && budget.action === "block") {
      await ctx.runAction(internal.actions.telegram.sendMessage, {
        chatId: inbound.externalChatId,
        text: "Usage limit reached. Please try again later.",
        replyToMessageId: parseInt(inbound.externalMessageId),
      });
      return;
    }

    // Create activeRun
    const runId = await ctx.runMutation(api.functions.activeRuns.create, {
      gatewayId,
      sessionId,
      status: "thinking",
    });

    try {
      // Get agent config
      const agent = await ctx.runQuery(api.functions.agents.get, { id: agentId });
      if (!agent) throw new Error("Agent not found");

      // Get recent messages for context
      const recentMessages = await ctx.runQuery(api.functions.messages.getRecent, {
        sessionId,
        limit: 15,
      });

      // Build Claude messages
      const claudeMessages = recentMessages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })).filter((m: { role: string }) => m.role === "user" || m.role === "assistant");

      // Get enabled tools
      const enabledTools = await ctx.runQuery(api.functions.tools.getEnabled, {
        gatewayId,
      });
      const toolDefs = enabledTools.map((t: any) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));

      // Call AI (use chatStream - same as web chat, proven to work)
      const response = await ctx.runAction(internal.actions.ai.chatStream, {
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        messages: claudeMessages,
        maxTokens: agent.maxTokens || 4096,
        temperature: agent.temperature,
        runId: runId as string,
      });

      const cost = calculateCost(response.model, response.usage.input, response.usage.output);

      // Store assistant message
      const msgId = await ctx.runMutation(api.functions.messages.create, {
        gatewayId,
        sessionId,
        agentId,
        role: "assistant",
        content: response.content,
        tokens: response.usage,
        cost,
        model: response.model,
        latencyMs: response.latencyMs,
      });

      // Send to Telegram
      await ctx.runAction(internal.actions.telegram.sendMessage, {
        chatId: inbound.externalChatId,
        text: response.content,
        replyToMessageId: parseInt(inbound.externalMessageId),
      });

      // Record usage
      await ctx.runMutation(api.functions.usage.record, {
        gatewayId,
        agentId,
        sessionId,
        messageId: msgId,
        model: response.model,
        inputTokens: response.usage.input,
        outputTokens: response.usage.output,
        cost,
      });

      // Complete run
      await ctx.runMutation(api.functions.activeRuns.complete, { id: runId });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error("processInbound error:", errorMsg);
      await ctx.runMutation(api.functions.activeRuns.updateStatus, {
        id: runId,
        status: "error",
        error: errorMsg,
      });
      // Try to notify user
      try {
        await ctx.runAction(internal.actions.telegram.sendMessage, {
          chatId: inbound.externalChatId,
          text: "Sorry, something went wrong processing your message.",
          replyToMessageId: parseInt(inbound.externalMessageId),
        });
      } catch {
        // Best effort
      }
    }
  },
});

export const processSession = internalAction({
  args: {
    sessionId: v.id("sessions"),
    gatewayId: v.id("gateways"),
  },
  handler: async (ctx, args) => {
    const { sessionId, gatewayId } = args;

    // Check budget
    const budget = await ctx.runQuery(api.functions.usage.checkBudget, { gatewayId });
    if (!budget.allowed && "action" in budget && budget.action === "block") {
      return;
    }

    // Get session to find agentId
    const session = await ctx.runQuery(api.functions.sessions.get, { id: sessionId });
    if (!session) throw new Error("Session not found");
    const agentId = session.agentId;

    // Create activeRun
    const runId = await ctx.runMutation(api.functions.activeRuns.create, {
      gatewayId,
      sessionId,
      status: "thinking",
    });

    try {
      // Get agent config
      const agent = await ctx.runQuery(api.functions.agents.get, { id: agentId });
      if (!agent) throw new Error("Agent not found");

      // Get recent messages
      const recentMessages = await ctx.runQuery(api.functions.messages.getRecent, {
        sessionId,
        limit: 15,
      });

      const claudeMessages = recentMessages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })).filter((m: { role: string }) => m.role === "user" || m.role === "assistant");

      // Call Claude with streaming
      const response = await ctx.runAction(internal.actions.ai.chatStream, {
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        messages: claudeMessages,
        maxTokens: agent.maxTokens || 4096,
        temperature: agent.temperature,
        runId,
      });

      const cost = calculateCost(response.model, response.usage.input, response.usage.output);

      // Store assistant message
      const msgId = await ctx.runMutation(api.functions.messages.create, {
        gatewayId,
        sessionId,
        agentId,
        role: "assistant",
        content: response.content,
        tokens: response.usage,
        cost,
        model: response.model,
        latencyMs: response.latencyMs,
      });

      // Record usage
      await ctx.runMutation(api.functions.usage.record, {
        gatewayId,
        agentId,
        sessionId,
        messageId: msgId,
        model: response.model,
        inputTokens: response.usage.input,
        outputTokens: response.usage.output,
        cost,
      });

      // Complete run
      await ctx.runMutation(api.functions.activeRuns.complete, { id: runId });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error("processSession error:", errorMsg);
      await ctx.runMutation(api.functions.activeRuns.updateStatus, {
        id: runId,
        status: "error",
        error: errorMsg,
      });
    }
  },
});

// Public wrapper for processInbound - called by the grammY bot process
// Validates admin key before processing
export const processInboundPublic = action({
  args: {
    platform: v.literal("telegram"),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    // Delegate to the internal handler
    await ctx.runAction(internal.actions.router.processInbound, {
      platform: args.platform,
      payload: args.payload,
    });
  },
});
