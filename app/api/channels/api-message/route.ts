import { NextRequest, NextResponse } from "next/server";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildContext } from "@/lib/contextBuilder";
import { executeTools, toProviderTools } from "@/lib/toolExecutor";
import { resolveConversation } from "@/lib/conversationManager";
import { BUILTIN_TOOLS } from "@/lib/builtinTools";
import { extractBearerToken, safeEqualSecret } from "@/lib/security";
import { applyResponsePrefix } from "@/lib/messageFormatting";
import { resolveAiSelection } from "@/lib/aiRouting";

// --- Rate Limiting ---
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute per channel
const rateLimitMap = new Map<string, number[]>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitMap) {
    const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) rateLimitMap.delete(key);
    else rateLimitMap.set(key, valid);
  }
}, 300_000);

function checkRateLimit(channelId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const timestamps = rateLimitMap.get(channelId) || [];
  const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (valid.length >= RATE_LIMIT_MAX) {
    const oldest = valid[0];
    const retryAfter = Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter };
  }

  valid.push(now);
  rateLimitMap.set(channelId, valid);
  return { allowed: true };
}

async function validateAndSetup(req: NextRequest) {
  const apiKey = extractBearerToken(req.headers.get("authorization"));
  if (!apiKey) throw { status: 401, message: "Missing Bearer token" };

  const body = await req.json();
  const { channelId, message, externalUserId, stream, metadata } = body;
  if (!channelId || !message) throw { status: 400, message: "channelId and message required" };

  const channel = await convexClient.query(api.functions.channels.get, { id: channelId as Id<"channels"> });
  if (!channel || channel.platform !== "api") throw { status: 404, message: "Invalid API channel" };
  const channelApiKey = (channel as any).apiKey || (channel as any).config?.apiKey;
  if (!channelApiKey || !safeEqualSecret(apiKey, channelApiKey)) {
    throw { status: 403, message: "Invalid API key" };
  }

  const gatewayId = channel.gatewayId as Id<"gateways">;
  const agentId = channel.agentId as Id<"agents">;

  const sessionId = await convexClient.mutation(api.functions.sessions.findOrCreate, {
    gatewayId, agentId, channelId: channelId as Id<"channels">,
    externalUserId: externalUserId || "api-user",
  });

  // Resolve conversation (segmentation)
  let conversationId: Id<"conversations"> | undefined;
  try {
    conversationId = await resolveConversation(
      sessionId as Id<"sessions">,
      gatewayId as Id<"gateways">,
      undefined,
      message
    );
    console.log(`[API Channel] Resolved conversation: ${conversationId}`);
  } catch (err) {
    console.error("[API Channel] Failed to resolve conversation:", err);
  }

  const userMessageId = await convexClient.mutation(api.functions.messages.create, {
    gatewayId, sessionId, agentId, role: "user", content: message, metadata: metadata || undefined, conversationId,
  });

  return { apiKey, message, stream, gatewayId, agentId, sessionId, conversationId, userMessageId };
}

async function getAIConfig(gatewayId: Id<"gateways">, agentId: Id<"agents">, message: string) {
  const getConfig = async (key: string) => {
    try {
      const r = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, { gatewayId, key });
      return r?.value || null;
    } catch { return await convexClient.query(api.functions.config.get, { key }); }
  };

  const responsePrefix = await getConfig("messages.response_prefix");

  const agent = await convexClient.query(api.functions.agents.get, { id: agentId });
  if (!agent) throw new Error("Agent not found");

  const builtinToolDefs = BUILTIN_TOOLS.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
  const enabledTools = await convexClient.query(api.functions.tools.getEnabled, { gatewayId });
  const dbToolNames = new Set(enabledTools.map((t: any) => t.name));
  const allToolDefs = [...builtinToolDefs.filter(t => !dbToolNames.has(t.name)), ...enabledTools];
  const customRoutes = await convexClient.query(api.functions.modelRoutes.list, { gatewayId });
  const selection = await resolveAiSelection({
    gatewayId,
    capability: "tool_use",
    message,
    agentModel: agent.model,
    customRoutes: customRoutes as any,
  });
  if (!selection.apiKey) throw new Error("No API key configured");

  return {
    provider: selection.provider,
    key: selection.apiKey,
    modelId: selection.model,
    agent,
    allToolDefs,
    responsePrefix,
  };
}

/**
 * POST /api/channels/api-message
 * Headers: Authorization: Bearer <apiKey>
 * Body: { channelId, message, stream?: boolean, externalUserId?, metadata? }
 * 
 * Non-streaming: { response, sessionId, model, tokens }
 * Streaming: SSE with token/tool_use/done/error events
 */
export async function POST(req: NextRequest) {
  try {
    // Check rate limit before expensive operations
    const bodyClone = req.clone();
    let channelIdForRateLimit: string | undefined;
    try {
      const peek = await bodyClone.json();
      channelIdForRateLimit = peek.channelId;
    } catch {}

    if (channelIdForRateLimit) {
      const rl = checkRateLimit(channelIdForRateLimit);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: "Rate limit exceeded", retryAfter: rl.retryAfter },
          { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
        );
      }
    }

    const ctx = await validateAndSetup(req);
    const config = await getAIConfig(ctx.gatewayId, ctx.agentId, ctx.message);
    let responseConversationId = ctx.conversationId;
    let movedUserMessageToNewConversation = false;

    const { registerBuiltInApiProviders, getModel, streamSimple } = await import("@mariozechner/pi-ai");
    registerBuiltInApiProviders();

    const modelId = config.modelId;
    const model = getModel(config.provider as any, modelId as any);
    if (!model) throw new Error(`Model "${modelId}" not found`);

    const { systemPrompt, messages: ctxMessages } = await buildContext(
      ctx.sessionId as Id<"sessions">,
      ctx.agentId as Id<"agents">,
      "",
      5000,
      responseConversationId,
    );

    const providerTools = toProviderTools(config.allToolDefs);

    const aiContext: any = {
      systemPrompt,
      messages: ctxMessages.map((m: any) =>
        m.role === "user"
          ? { role: "user", content: m.content, timestamp: Date.now() }
          : { role: "assistant", content: [{ type: "text", text: m.content }], timestamp: Date.now() }
      ),
      ...(providerTools ? { tools: providerTools } : {}),
    };

    const options: any = { maxTokens: config.agent.maxTokens || 4096, apiKey: config.key };
    if (config.agent.temperature !== undefined) options.temperature = config.agent.temperature;

    if (ctx.stream) {
      // SSE streaming
      const encoder = new TextEncoder();
      const sseEvent = (data: any) => `data: ${JSON.stringify(data)}\n\n`;

      const stream = new ReadableStream({
        async start(controller) {
          try {
            let usage = { input: 0, output: 0 };
            let fullContent = "";
            const trimmedPrefix = (config.responsePrefix || "").trim();
            if (trimmedPrefix) {
              const prefixText = `${trimmedPrefix} `;
              fullContent = prefixText;
              controller.enqueue(encoder.encode(sseEvent({ type: "token", content: prefixText })));
            }

            for (let round = 0; round <= 5; round++) {
              const toolCalls: any[] = [];
              let roundText = "";

              const aiStream = streamSimple(model, aiContext, options);
              for await (const event of aiStream) {
                if (event.type === "text_delta") {
                  roundText += event.delta;
                  controller.enqueue(encoder.encode(sseEvent({ type: "token", content: event.delta })));
                } else if (event.type === "toolcall_end") {
                  toolCalls.push(event.toolCall);
                } else if (event.type === "done") {
                  usage.input += event.message.usage.input;
                  usage.output += event.message.usage.output;
                  aiContext.messages.push(event.message);
                }
              }

              fullContent += roundText;
              if (toolCalls.length === 0) break;

              controller.enqueue(encoder.encode(sseEvent({ type: "tool_use", tools: toolCalls.map((t: any) => t.name) })));

              const toolContext = {
                gatewayId: ctx.gatewayId as string,
                agentId: ctx.agentId as string,
                sessionId: ctx.sessionId as string,
                userRole: "viewer",
              };
              const toolResults = await executeTools(toolCalls, toolContext, config.allToolDefs as any);
              const switchedConvoId = (toolContext as any).__newConversationId as Id<"conversations"> | undefined;
              if (switchedConvoId) {
                responseConversationId = switchedConvoId;
                delete (toolContext as any).__newConversationId;
                console.log(`[API Channel] Tool requested conversation switch -> ${responseConversationId}`);
                if (!movedUserMessageToNewConversation) {
                  try {
                    await convexClient.mutation(api.functions.messages.updateConversationId, {
                      id: ctx.userMessageId as Id<"messages">,
                      conversationId: responseConversationId,
                    });
                    movedUserMessageToNewConversation = true;
                  } catch (err) {
                    console.error("[API Channel] Failed to move triggering user message:", err);
                  }
                }
              }
              for (const result of toolResults) {
                aiContext.messages.push({
                  role: "toolResult", toolCallId: result.toolCallId, toolName: result.toolName,
                  content: [{ type: "text", text: result.content }], isError: result.isError, timestamp: Date.now(),
                });
              }
            }

            // Store response
            const finalContent = applyResponsePrefix(fullContent, config.responsePrefix);
            await convexClient.mutation(api.functions.messages.create, {
              gatewayId: ctx.gatewayId, sessionId: ctx.sessionId, agentId: ctx.agentId,
              role: "assistant", content: finalContent, tokens: usage, model: modelId, conversationId: responseConversationId,
            });

            controller.enqueue(encoder.encode(sseEvent({ type: "done", sessionId: ctx.sessionId, model: modelId, tokens: usage })));
            controller.close();
          } catch (err: any) {
            controller.enqueue(encoder.encode(sseEvent({ type: "error", message: err.message || "Stream error" })));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    // Non-streaming
    let usage = { input: 0, output: 0 };
    let fullContent = "";
    const startMs = Date.now();

    for (let round = 0; round <= 5; round++) {
      const toolCalls: any[] = [];
      let roundText = "";

      const aiStream = streamSimple(model, aiContext, options);
      for await (const event of aiStream) {
        if (event.type === "text_delta") roundText += event.delta;
        else if (event.type === "toolcall_end") toolCalls.push(event.toolCall);
        else if (event.type === "done") {
          usage.input += event.message.usage.input;
          usage.output += event.message.usage.output;
          aiContext.messages.push(event.message);
        }
      }

      fullContent += roundText;
      if (toolCalls.length === 0) break;

      const toolContext = {
        gatewayId: ctx.gatewayId as string,
        agentId: ctx.agentId as string,
        sessionId: ctx.sessionId as string,
        userRole: "viewer",
      };
      const toolResults = await executeTools(toolCalls, toolContext, config.allToolDefs as any);
      const switchedConvoId = (toolContext as any).__newConversationId as Id<"conversations"> | undefined;
      if (switchedConvoId) {
        responseConversationId = switchedConvoId;
        delete (toolContext as any).__newConversationId;
        console.log(`[API Channel] Tool requested conversation switch -> ${responseConversationId}`);
        if (!movedUserMessageToNewConversation) {
          try {
            await convexClient.mutation(api.functions.messages.updateConversationId, {
              id: ctx.userMessageId as Id<"messages">,
              conversationId: responseConversationId,
            });
            movedUserMessageToNewConversation = true;
          } catch (err) {
            console.error("[API Channel] Failed to move triggering user message:", err);
          }
        }
      }
      for (const result of toolResults) {
        aiContext.messages.push({
          role: "toolResult", toolCallId: result.toolCallId, toolName: result.toolName,
          content: [{ type: "text", text: result.content }], isError: result.isError, timestamp: Date.now(),
        });
      }
    }

    const latencyMs = Date.now() - startMs;

    const finalContent = applyResponsePrefix(fullContent, config.responsePrefix);
    await convexClient.mutation(api.functions.messages.create, {
      gatewayId: ctx.gatewayId, sessionId: ctx.sessionId, agentId: ctx.agentId,
      role: "assistant", content: finalContent, tokens: usage, model: modelId, latencyMs, conversationId: responseConversationId,
    });

    return NextResponse.json({
      response: finalContent,
      sessionId: ctx.sessionId as string,
      model: modelId,
      tokens: usage,
      latencyMs,
    });
  } catch (error: any) {
    if (error.status) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[API Channel]", error);
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}
