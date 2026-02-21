"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal, api } from "../_generated/api";
import type { KnownProvider } from "@mariozechner/pi-ai";

// Lazy-init flag for registerBuiltInApiProviders
let providersRegistered = false;

const PROVIDER_ENV_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  minimax: "MINIMAX_API_KEY",
  moonshot: "MOONSHOT_API_KEY",
  groq: "GROQ_API_KEY",
  qwen: "QWEN_PORTAL_API_KEY",
  zai: "ZAI_API_KEY",
  qianfan: "QIANFAN_API_KEY",
  opencode: "OPENCODE_API_KEY",
  xiaomi: "XIAOMI_API_KEY",
  synthetic: "SYNTHETIC_API_KEY",
  venice: "VENICE_API_KEY",
  "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
  "cloudflare-ai-gateway": "CLOUDFLARE_AI_GATEWAY_API_KEY",
  "github-copilot": "COPILOT_GITHUB_TOKEN",
};

const DEFAULT_MODELS: Record<string, { provider: KnownProvider; model: string }> = {
  anthropic: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  openai: { provider: "openai", model: "gpt-4.1" },
  google: { provider: "google", model: "gemini-2.5-flash" },
  xai: { provider: "xai", model: "grok-3" },
  openrouter: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
  minimax: { provider: "minimax", model: "MiniMax-M2.1" },
  groq: { provider: "groq", model: "llama-3.3-70b-versatile" },
};

async function initProvider(
  ctx: any,
  requestedModel?: string,
): Promise<{ model: any; providerName: string; modelId: string; apiKey: string }> {
  // Read config from DB
  const [providerSlug, apiKey, configModel] = await Promise.all([
    ctx.runQuery(internal.functions.config.getInternal, { key: "ai_provider" }),
    ctx.runQuery(internal.functions.config.getInternal, { key: "ai_api_key" }),
    ctx.runQuery(internal.functions.config.getInternal, { key: "ai_model" }),
  ]);

  // Also fetch auth method for OAuth/setup token support
  const authMethod: string = (await ctx.runQuery(internal.functions.config.getInternal, { key: "ai_auth_method" })) || "api_key";

  // Fall back to anthropic + anthropic_api_key for backward compat
  const provider: string = providerSlug || "anthropic";
  let key: string = apiKey || "";
  if (!key && provider === "anthropic") {
    key = (await ctx.runQuery(internal.functions.config.getInternal, { key: "anthropic_api_key" })) || "";
  }
  if (!key) {
    key = process.env[PROVIDER_ENV_MAP[provider] || ""] || "";
  }
  if (!key) {
    throw new Error(`No API key configured for provider "${provider}". Set ai_api_key in system config.`);
  }

  // Set env var so pi-ai picks it up.
  // pi-ai auto-detects sk-ant-oat* tokens and uses Bearer auth + OAuth headers,
  // so setup tokens work seamlessly when passed as the API key.
  const envVar = PROVIDER_ENV_MAP[provider];
  if (envVar) {
    process.env[envVar] = key;
  }

  // Import pi-ai and register providers (once)
  const piAi = await import("@mariozechner/pi-ai");
  if (!providersRegistered) {
    piAi.registerBuiltInApiProviders();
    providersRegistered = true;
  }

  // Determine model ID and provider
  const modelId = requestedModel || configModel || DEFAULT_MODELS[provider]?.model || "claude-sonnet-4-20250514";
  const piProvider = (DEFAULT_MODELS[provider]?.provider || provider) as KnownProvider;

  const model = piAi.getModel(piProvider as any, modelId as any);
  if (!model) {
    throw new Error(`Model "${modelId}" not found for provider "${piProvider}"`);
  }

  return { model, providerName: piProvider, modelId, apiKey: key };
}

function convertMessages(messages: Array<{ role: string; content: string }>): any[] {
  return messages.map((m) => {
    if (m.role === "user") {
      return { role: "user" as const, content: m.content, timestamp: Date.now() };
    }
    // assistant
    return {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: m.content }],
      timestamp: Date.now(),
    };
  });
}

export const chat = internalAction({
  args: {
    model: v.string(),
    systemPrompt: v.string(),
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
    maxTokens: v.number(),
    temperature: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { model, modelId, apiKey: key } = await initProvider(ctx, args.model);
    const { streamSimple } = await import("@mariozechner/pi-ai");

    const context = {
      systemPrompt: args.systemPrompt,
      messages: convertMessages(args.messages),
    };

    const options: any = { maxTokens: args.maxTokens, apiKey: key };
    if (args.temperature !== undefined) {
      options.temperature = args.temperature;
    }

    const startMs = Date.now();
    let fullContent = "";
    let usage = { input: 0, output: 0 };

    const stream = streamSimple(model, context, options);
    for await (const event of stream) {
      if (event.type === "text_delta") {
        fullContent += event.delta;
      } else if (event.type === "done") {
        usage = {
          input: event.message.usage.input,
          output: event.message.usage.output,
        };
      }
    }

    const latencyMs = Date.now() - startMs;

    return {
      content: fullContent,
      usage,
      model: modelId,
      stopReason: "end_turn",
      latencyMs,
    };
  },
});

export const chatWithTools = internalAction({
  args: {
    model: v.string(),
    systemPrompt: v.string(),
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
    maxTokens: v.number(),
    temperature: v.optional(v.number()),
    tools: v.optional(v.array(v.object({
      name: v.string(),
      description: v.string(),
      parameters: v.any(),
    }))),
    gatewayId: v.string(),
    agentId: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const { model, modelId, apiKey: key } = await initProvider(ctx, args.model);
    const { streamSimple } = await import("@mariozechner/pi-ai");
    const { executeTools } = await import("../../lib/toolExecutor");

    const piMessages: any[] = convertMessages(args.messages);

    const context: any = {
      systemPrompt: args.systemPrompt,
      messages: piMessages,
      ...(args.tools && args.tools.length > 0 ? { tools: args.tools } : {}),
    };

    const options: any = { maxTokens: args.maxTokens, apiKey: key };
    if (args.temperature !== undefined) options.temperature = args.temperature;

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

      // Execute tools
      const toolResults = await executeTools(toolCalls, {
        gatewayId: args.gatewayId,
        agentId: args.agentId,
        sessionId: args.sessionId,
        userRole: "viewer",
      }, args.tools as any);

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

    return {
      content: fullContent,
      usage,
      model: modelId,
      stopReason: "end_turn",
      latencyMs,
    };
  },
});

export const chatStream = internalAction({
  args: {
    model: v.string(),
    systemPrompt: v.string(),
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
    maxTokens: v.number(),
    temperature: v.optional(v.number()),
    runId: v.id("activeRuns"),
  },
  handler: async (ctx, args) => {
    const { model, modelId, apiKey: key } = await initProvider(ctx, args.model);
    const { streamSimple } = await import("@mariozechner/pi-ai");

    const context = {
      systemPrompt: args.systemPrompt,
      messages: convertMessages(args.messages),
    };

    const options: any = { maxTokens: args.maxTokens, apiKey: key };
    if (args.temperature !== undefined) {
      options.temperature = args.temperature;
    }

    const startMs = Date.now();
    let fullContent = "";
    let usage = { input: 0, output: 0 };
    let firstChunk = true;

    const stream = streamSimple(model, context, options);
    for await (const event of stream) {
      if (event.type === "text_delta") {
        const chunk = event.delta;
        fullContent += chunk;

        if (firstChunk) {
          await ctx.runMutation(api.functions.activeRuns.updateStatus, {
            id: args.runId,
            status: "streaming",
          });
          firstChunk = false;
        }

        await ctx.runMutation(api.functions.activeRuns.appendStream, {
          id: args.runId,
          chunk,
        });
      } else if (event.type === "done") {
        usage = {
          input: event.message.usage.input,
          output: event.message.usage.output,
        };
      }
    }

    const latencyMs = Date.now() - startMs;

    return {
      content: fullContent,
      usage,
      model: modelId,
      stopReason: "end_turn",
      latencyMs,
    };
  },
});
