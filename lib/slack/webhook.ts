// lib/slack/webhook.ts - Webhook handler for Slack Events API
import { createHmac, timingSafeEqual } from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sendTextMessage } from "./send";
import { getSlackConfig, type SlackConfig } from "./config";
import { executeTools, toProviderTools } from "../toolExecutor";
import { BUILTIN_TOOLS } from "../builtinTools";
import { resolveConversation } from "../conversationManager";

const CONVEX_URL = process.env.CONVEX_URL || process.env.CONVEX_SELF_HOSTED_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3220";

// --- Deduplication ---
const DEDUP_TTL_MS = 5 * 60 * 1000;
const DEDUP_MAX_SIZE = 2000;
const recentMessages = new Map<string, number>();

function dedupCheck(eventId: string): boolean {
  const now = Date.now();
  if (recentMessages.size > DEDUP_MAX_SIZE) {
    for (const [k, ts] of recentMessages) {
      if (now - ts > DEDUP_TTL_MS) recentMessages.delete(k);
    }
  }
  if (recentMessages.has(eventId)) return true;
  recentMessages.set(eventId, now);
  return false;
}

/**
 * Verify Slack request signature.
 * See: https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySignature(
  body: string,
  timestamp: string,
  signature: string,
  signingSecret: string
): boolean {
  // Reject requests older than 5 minutes
  const ts = parseInt(timestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const sigBaseString = `v0:${timestamp}:${body}`;
  const mySignature = "v0=" + createHmac("sha256", signingSecret).update(sigBaseString).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Process incoming Slack event payload.
 */
export async function handleIncomingEvent(payload: any): Promise<void> {
  const event = payload.event;
  if (!event) return;

  // Only handle message events (no subtypes like message_changed, bot_message, etc.)
  if (event.type !== "message") return;
  if (event.subtype) return; // Ignore edits, deletes, bot messages with subtypes
  if (event.bot_id) return; // Ignore bot's own messages
  if (!event.text) return;

  const eventId = event.client_msg_id || event.event_ts || `${event.channel}-${event.ts}`;
  if (dedupCheck(eventId)) return;

  console.log(`[slack] Message from ${event.user} in ${event.channel}: ${event.text.slice(0, 80)}`);

  processMessage(event).catch((err) => {
    console.error("[slack] Message processing error:", err);
  });
}

async function processMessage(event: any): Promise<void> {
  const text = event.text;
  const userId = event.user;
  const channel = event.channel;
  const threadTs = event.thread_ts || event.ts;

  const slackConfig = await getSlackConfig();
  if (!slackConfig) {
    console.error("[slack] Slack not configured");
    return;
  }

  // If channel filter is set, only respond in those channels
  if (slackConfig.channelIds && slackConfig.channelIds.length > 0) {
    if (!slackConfig.channelIds.includes(channel)) {
      return;
    }
  }

  // Convex client
  const convex = new ConvexHttpClient(CONVEX_URL);
  const adminKey = process.env.CONVEX_ADMIN_KEY || process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
  if (adminKey) (convex as any).setAdminAuth(adminKey);

  // Find slack channel
  const channelDoc = await convex.query(api.functions.channels.findByPlatform, {
    platform: "slack" as any,
  }).catch((e: any) => {
    console.error("[slack] Failed to find channel:", e);
    return null;
  });

  if (!channelDoc) {
    console.error("[slack] No slack channel found in Convex");
    await sendTextMessage(slackConfig.botToken, channel, "Bot not fully configured. Please set up a Slack channel in Synapse settings.", threadTs);
    return;
  }

  const gatewayId = channelDoc.gatewayId as Id<"gateways">;
  const agentId = channelDoc.agentId as Id<"agents">;

  // Resolve display name
  let displayName = userId;
  try {
    const { WebClient } = await import("@slack/web-api");
    const client = new WebClient(slackConfig.botToken);
    const info = await client.users.info({ user: userId });
    displayName = info.user?.real_name || info.user?.name || userId;
  } catch {}

  // Upsert channel user
  try {
    await convex.mutation(api.functions.channels.upsertChannelUser, {
      channelId: channelDoc._id,
      externalUserId: `slack:${userId}`,
      displayName,
      isBot: false,
    });
  } catch {}

  // Find or create session
  const sessionId = await convex.mutation(api.functions.sessions.findOrCreate, {
    gatewayId,
    agentId,
    channelId: channelDoc._id,
    externalUserId: `slack:${userId}`,
  });

  // Resolve conversation before storing the user message
  let conversationId: Id<"conversations"> | undefined;
  try {
    conversationId = await resolveConversation(
      sessionId as Id<"sessions">,
      gatewayId as Id<"gateways">,
      undefined,
      text
    );
    console.log(`[slack] Resolved conversation: ${conversationId}`);
  } catch (err) {
    console.error("[slack] Failed to resolve conversation:", err);
  }

  // Store user message
  const userMessageId = await convex.mutation(api.functions.messages.create, {
    gatewayId,
    sessionId,
    agentId,
    role: "user",
    content: text,
    channelMessageId: event.ts,
    conversationId,
  });

  // Check budget
  const budget = await convex.query(api.functions.usage.checkBudget, { gatewayId });
  if (!budget.allowed) {
    await sendTextMessage(slackConfig.botToken, channel, "Usage limit reached. Please try again later.", threadTs);
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
    const gwId = channelDoc.gatewayId;
    const { getGatewayConfig, getConfig } = await import("./config");
    let providerSlug: string | null, apiKey: string | null, configModel: string | null;

    if (gwId) {
      [providerSlug, apiKey, configModel] = await Promise.all([
        getGatewayConfig(gwId, "ai_provider"),
        getGatewayConfig(gwId, "ai_api_key"),
        getGatewayConfig(gwId, "ai_model"),
      ]);
    } else {
      providerSlug = apiKey = configModel = null;
    }
    if (!providerSlug) providerSlug = await getConfig("ai_provider");
    if (!apiKey) apiKey = await getConfig("ai_api_key");
    if (!configModel) configModel = await getConfig("ai_model");

    const provider = providerSlug || "anthropic";
    const key = apiKey || "";
    if (!key) throw new Error("No API key configured");

    const envMap: Record<string, string> = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GEMINI_API_KEY",
    };
    if (envMap[provider]) process.env[envMap[provider]] = key;

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
      console.warn("[slack] buildContext failed, using fallback:", e);
      const recentMsgs = await convex.query(api.functions.messages.getRecent, {
        sessionId,
        limit: 15,
      });
      claudeMessages = recentMsgs
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

    const startMs = Date.now();
    let fullContent = "";
    let usage = { input: 0, output: 0 };
    const MAX_TOOL_ROUNDS = 5;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const toolCalls: any[] = [];
      let roundText = "";
      const stream = streamSimple(model, context, options);
      for await (const ev of stream) {
        if (ev.type === "text_delta") {
          roundText += ev.delta;
        } else if (ev.type === "toolcall_end") {
          toolCalls.push(ev.toolCall);
        } else if (ev.type === "done") {
          usage.input += ev.message.usage.input;
          usage.output += ev.message.usage.output;
          context.messages.push(ev.message);
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
        console.log(`[slack] Tool requested conversation switch -> ${responseConversationId}`);
        if (!movedUserMessageToNewConversation) {
          try {
            await convex.mutation(api.functions.messages.updateConversationId, {
              id: userMessageId as Id<"messages">,
              conversationId: responseConversationId,
            });
            movedUserMessageToNewConversation = true;
          } catch (err) {
            console.error("[slack] Failed to move triggering user message:", err);
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

    // Send response via Slack (reply in thread)
    const result = await sendTextMessage(slackConfig.botToken, channel, fullContent, threadTs);
    if (!result.ok) {
      console.error("[slack] Failed to send response:", result.error);
    }

    // Complete run
    await convex.mutation(api.functions.activeRuns.complete, { id: runId });

    console.log(`[slack] Response sent (${latencyMs}ms, ${usage.input}+${usage.output} tokens)`);

    // Push notification
    try {
      const { sendPushToAll } = await import("../pushService");
      const preview = fullContent.length > 100 ? fullContent.slice(0, 100) + "..." : fullContent;
      await sendPushToAll({ title: "Synapse - Slack Message", body: preview, url: "/chat" });
    } catch {}

  } catch (aiErr: any) {
    console.error("[slack] AI processing error:", aiErr);
    await convex.mutation(api.functions.activeRuns.updateStatus, {
      id: runId,
      status: "error",
      error: aiErr.message || "Unknown error",
    });
    await sendTextMessage(slackConfig.botToken, channel, "Sorry, I encountered an error processing your message.", threadTs);
  }
}
