// lib/whatsapp/webhook.ts - Webhook handler for WhatsApp Cloud API
import { createHmac } from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sendTextMessage, markAsRead } from "./send";
import { getWhatsAppConfig, type WhatsAppConfig } from "./config";
import { safeEqualSecret } from "../security";
import { executeTools, toProviderTools } from "../toolExecutor";
import { BUILTIN_TOOLS } from "../builtinTools";
import { resolveConversation } from "../conversationManager";

const CONVEX_URL = process.env.CONVEX_URL || process.env.CONVEX_SELF_HOSTED_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3220";

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

/**
 * Verify webhook signature using app secret.
 */
export function verifySignature(body: string, signature: string, appSecret: string): boolean {
  const expected = createHmac("sha256", appSecret).update(body).digest("hex");
  return safeEqualSecret(signature, `sha256=${expected}`);
}

/**
 * Handle webhook verification (GET request from Meta).
 */
export function handleVerification(
  mode: string | null,
  token: string | null,
  challenge: string | null,
  verifyToken: string
): { status: number; body: string } {
  if (mode === "subscribe" && safeEqualSecret(token, verifyToken)) {
    console.log("[whatsapp] Webhook verified");
    return { status: 200, body: challenge || "" };
  }
  console.warn("[whatsapp] Webhook verification failed");
  return { status: 403, body: "Forbidden" };
}

interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}

/**
 * Process incoming webhook POST payload.
 */
export async function handleIncomingWebhook(payload: any): Promise<void> {
  const entry = payload?.entry;
  if (!entry || !Array.isArray(entry)) return;

  for (const e of entry) {
    const changes = e.changes;
    if (!changes || !Array.isArray(changes)) continue;

    for (const change of changes) {
      if (change.field !== "messages") continue;
      const value = change.value;
      if (!value?.messages) continue;

      const messages: WhatsAppMessage[] = value.messages;
      const contacts: WhatsAppContact[] = value.contacts || [];
      const metadata = value.metadata;

      for (const msg of messages) {
        if (msg.type !== "text" || !msg.text?.body) continue;
        if (dedupCheck(msg.id)) continue;

        const contact = contacts.find((c) => c.wa_id === msg.from);
        const displayName = contact?.profile?.name || msg.from;

        console.log(`[whatsapp] Message from ${displayName} (${msg.from}): ${msg.text.body.slice(0, 80)}`);

        // Process in background to respond to webhook quickly
        processMessage(msg, displayName, metadata?.phone_number_id).catch((err) => {
          console.error("[whatsapp] Message processing error:", err);
        });
      }
    }
  }
}

async function processMessage(msg: WhatsAppMessage, displayName: string, phoneNumberId?: string): Promise<void> {
  const text = msg.text!.body;
  const userId = msg.from;

  const waConfig = await getWhatsAppConfig();
  if (!waConfig) {
    console.error("[whatsapp] WhatsApp not configured");
    return;
  }

  const effectivePhoneId = phoneNumberId || waConfig.phoneNumberId;

  // Mark as read
  await markAsRead(effectivePhoneId, waConfig.accessToken, msg.id);

  // Convex client
  const convex = new ConvexHttpClient(CONVEX_URL);
  const adminKey = process.env.CONVEX_ADMIN_KEY || process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
  if (adminKey) (convex as any).setAdminAuth(adminKey);

  // Find whatsapp channel
  const channelDoc = await convex.query(api.functions.channels.findByPlatform, {
    platform: "whatsapp",
  }).catch((e: any) => {
    console.error("[whatsapp] Failed to find channel:", e);
    return null;
  });

  if (!channelDoc) {
    console.error("[whatsapp] No whatsapp channel found in Convex");
    await sendTextMessage(effectivePhoneId, waConfig.accessToken, userId, "Bot not fully configured. Please set up a WhatsApp channel in Synapse settings.");
    return;
  }

  const gatewayId = channelDoc.gatewayId as Id<"gateways">;
  const agentId = channelDoc.agentId as Id<"agents">;

  // Upsert channel user
  try {
    await convex.mutation(api.functions.channels.upsertChannelUser, {
      channelId: channelDoc._id,
      externalUserId: `whatsapp:${userId}`,
      displayName,
      isBot: false,
    });
  } catch {}

  // Find or create session
  const sessionId = await convex.mutation(api.functions.sessions.findOrCreate, {
    gatewayId,
    agentId,
    channelId: channelDoc._id,
    externalUserId: `whatsapp:${userId}`,
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
    console.log(`[whatsapp] Resolved conversation: ${conversationId}`);
  } catch (err) {
    console.error("[whatsapp] Failed to resolve conversation:", err);
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
    await sendTextMessage(effectivePhoneId, waConfig.accessToken, userId, "Usage limit reached. Please try again later.");
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
    let providerSlug: string | null, apiKey: string | null, configModel: string | null;

    const { getGatewayConfig, getConfig } = await import("./config");
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
      console.warn("[whatsapp] buildContext failed, using fallback:", e);
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

    const startMs = Date.now();
    let fullContent = "";
    let usage = { input: 0, output: 0 };
    const MAX_TOOL_ROUNDS = 5;

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
        console.log(`[whatsapp] Tool requested conversation switch -> ${responseConversationId}`);
        if (!movedUserMessageToNewConversation) {
          try {
            await convex.mutation(api.functions.messages.updateConversationId, {
              id: userMessageId as Id<"messages">,
              conversationId: responseConversationId,
            });
            movedUserMessageToNewConversation = true;
          } catch (err) {
            console.error("[whatsapp] Failed to move triggering user message:", err);
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

    // Send response via WhatsApp
    const result = await sendTextMessage(effectivePhoneId, waConfig.accessToken, userId, fullContent);
    if (!result.ok) {
      console.error("[whatsapp] Failed to send response:", result.error);
    }

    // Complete run
    await convex.mutation(api.functions.activeRuns.complete, { id: runId });

    console.log(`[whatsapp] Response sent (${latencyMs}ms, ${usage.input}+${usage.output} tokens)`);

    // Push notification
    try {
      const { sendPushToAll } = await import("../pushService");
      const preview = fullContent.length > 100 ? fullContent.slice(0, 100) + "..." : fullContent;
      await sendPushToAll({ title: "Synapse - New Message", body: preview, url: "/chat" });
    } catch {}

  } catch (aiErr: any) {
    console.error("[whatsapp] AI processing error:", aiErr);
    await convex.mutation(api.functions.activeRuns.updateStatus, {
      id: runId,
      status: "error",
      error: aiErr.message || "Unknown error",
    });
    await sendTextMessage(effectivePhoneId, waConfig.accessToken, userId, "Sorry, I encountered an error processing your message.");
  }
}
