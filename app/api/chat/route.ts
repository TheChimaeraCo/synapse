// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0
import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { checkFeature, getCurrentTier } from "@/lib/license";
import { buildContext } from "@/lib/contextBuilder";
import { extractKnowledge } from "@/lib/knowledgeExtractor";
import { executeTools, toProviderTools } from "@/lib/toolExecutor";
import { selectModel, DEFAULT_ROUTING } from "@/lib/modelRouter";
import type { ModelRoutingConfig, TaskType } from "@/lib/modelRouter";
import { createHash } from "crypto";

const MODEL_COSTS: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "claude-sonnet-4-20250514": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-opus-4-20250514": { inputPerMillion: 15, outputPerMillion: 75 },
  "claude-haiku-3-20250514": { inputPerMillion: 0.25, outputPerMillion: 1.25 },
};

function calculateCost(model: string, input: number, output: number): number {
  const costs = MODEL_COSTS[model] || { inputPerMillion: 3, outputPerMillion: 15 };
  return (input / 1_000_000 * costs.inputPerMillion) + (output / 1_000_000 * costs.outputPerMillion);
}

export async function POST(req: NextRequest) {
  try {
    const { userId, gatewayId } = await getGatewayContext(req);
    const { sessionId, content } = await req.json();

    if (!sessionId || !content?.trim()) {
      return NextResponse.json({ error: "sessionId and content are required" }, { status: 400 });
    }

    const sessionDoc = await convexClient.query(api.functions.sessions.get, {
      id: sessionId as Id<"sessions">,
    });
    if (!sessionDoc) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const messageId = await convexClient.mutation(api.functions.messages.create, {
      gatewayId: gatewayId as Id<"gateways">,
      sessionId: sessionId as Id<"sessions">,
      agentId: sessionDoc.agentId,
      role: "user",
      content: content.trim(),
    });

    const budgetCheck = await convexClient.query(api.functions.usage.checkBudget, {
      gatewayId: gatewayId as Id<"gateways">,
    });

    if (!budgetCheck.allowed) {
      await convexClient.mutation(api.functions.messages.create, {
        gatewayId: gatewayId as Id<"gateways">,
        sessionId: sessionId as Id<"sessions">,
        agentId: sessionDoc.agentId,
        role: "assistant",
        content: `I'm unable to respond right now. ${budgetCheck.reason || "Budget limit reached."}  Please check your budget settings or try again later.`,
      });
      return NextResponse.json({ messageId, sessionId, budgetBlocked: true });
    }

    processAIResponse(
      sessionId as Id<"sessions">,
      gatewayId as Id<"gateways">,
      sessionDoc.agentId,
      budgetCheck.suggestedModel || undefined,
    ).catch((err) => {
      console.error("AI processing error:", err);
    });

    return NextResponse.json({ messageId, sessionId });
  } catch (err) {
    return handleGatewayError(err);
  }
}

async function processAIResponse(
  sessionId: Id<"sessions">,
  gatewayId: Id<"gateways">,
  agentId: Id<"agents">,
  suggestedModel?: string,
) {
  const runId = await convexClient.mutation(api.functions.activeRuns.create, {
    gatewayId,
    sessionId,
    status: "thinking",
  });

  try {
    const { systemPrompt, messages: claudeMessages } = await buildContext(
      sessionId, agentId, "", 5000
    );

    const agent = await convexClient.query(api.functions.agents.get, { id: agentId });
    if (!agent) throw new Error("Agent not found");

    // Try gateway config first, fall back to systemConfig
    const getConfig = async (key: string) => {
      try {
        const result = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
          gatewayId,
          key,
        });
        return result?.value || null;
      } catch {
        return await convexClient.query(api.functions.config.get, { key });
      }
    };

    const [providerSlug, apiKey, configModel, authMethod] = await Promise.all([
      getConfig("ai_provider"),
      getConfig("ai_api_key"),
      getConfig("ai_model"),
      getConfig("ai_auth_method"),
    ]);

    const provider = providerSlug || "anthropic";
    const key = apiKey || process.env.ANTHROPIC_API_KEY || "";
    if (!key) throw new Error("No API key configured");

    const envMap: Record<string, string> = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GEMINI_API_KEY",
    };
    if (envMap[provider]) process.env[envMap[provider]] = key;

    const { registerBuiltInApiProviders, getModel, streamSimple } = await import("@mariozechner/pi-ai");
    registerBuiltInApiProviders();

    const routingRaw = await getConfig("model_routing");
    const routingConfig: ModelRoutingConfig | null = routingRaw ? JSON.parse(routingRaw) : null;

    const enabledTools = await convexClient.query(api.functions.tools.getEnabled, { gatewayId });
    const providerTools = enabledTools.length > 0 ? toProviderTools(enabledTools) : undefined;
    const taskType: TaskType = enabledTools.length > 0 ? "tool_use" : "chat";

    const budgetState = {
      allowed: true,
      suggestedModel,
      remainingUsd: undefined as number | undefined,
    };

    const modelId = selectModel(taskType, routingConfig, budgetState, agent.model || configModel || undefined);
    const model = getModel(provider as any, modelId as any);
    if (!model) throw new Error(`Model "${modelId}" not found`);

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

    const lastUserMsg = claudeMessages.filter((m: any) => m.role === "user").pop();
    const cacheHash = enabledTools.length === 0 && lastUserMsg
      ? createHash("sha256").update(systemPrompt + "|" + lastUserMsg.content).digest("hex")
      : null;

    if (cacheHash) {
      const cached = await convexClient.query(api.functions.responseCache.getCached, { hash: cacheHash });
      if (cached) {
        await convexClient.mutation(api.functions.messages.create, {
          gatewayId, sessionId, agentId,
          role: "assistant", content: cached.response, tokens: cached.tokens, cost: cached.cost, model: cached.model, latencyMs: 0,
        });
        await convexClient.mutation(api.functions.activeRuns.complete, { id: runId });
        return;
      }
    }

    const startMs = Date.now();
    let fullContent = "";
    let usage = { input: 0, output: 0 };
    const MAX_TOOL_ROUNDS = 5;

    await convexClient.mutation(api.functions.activeRuns.updateStatus, { id: runId, status: "streaming" });

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const toolCalls: Array<{ type: "toolCall"; id: string; name: string; arguments: Record<string, any> }> = [];
      let roundText = "";

      const stream = streamSimple(model, context, options);
      for await (const event of stream) {
        if (event.type === "text_delta") {
          roundText += event.delta;
          await convexClient.mutation(api.functions.activeRuns.appendStream, { id: runId, chunk: event.delta });
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

      const toolResults = await executeTools(toolCalls, {
        gatewayId: gatewayId as string,
        agentId: agentId as string,
        sessionId: sessionId as string,
      });

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
    const cost = calculateCost(modelId, usage.input, usage.output);

    const msgId = await convexClient.mutation(api.functions.messages.create, {
      gatewayId, sessionId, agentId,
      role: "assistant", content: fullContent, tokens: usage, cost, model: modelId, latencyMs,
    });

    await convexClient.mutation(api.functions.usage.record, {
      gatewayId, agentId, sessionId, messageId: msgId,
      model: modelId, inputTokens: usage.input, outputTokens: usage.output, cost,
    });

    if (cacheHash && enabledTools.length === 0) {
      await convexClient.mutation(api.functions.responseCache.setCache, {
        hash: cacheHash, response: fullContent, model: modelId, tokens: usage, cost,
      });
    }

    await convexClient.mutation(api.functions.activeRuns.complete, { id: runId });

    extractKnowledge(msgId, agentId, gatewayId, sessionId).catch(console.error);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("processAIResponse error:", errorMsg);
    await convexClient.mutation(api.functions.activeRuns.updateStatus, {
      id: runId, status: "error", error: errorMsg,
    });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId, gatewayId } = await getGatewayContext(req);
    const channel = await convexClient.query(api.functions.channels.getByPlatform, {
      gatewayId: gatewayId as Id<"gateways">, platform: "hub",
    });
    if (!channel) {
      return NextResponse.json({ error: "Hub channel not configured" }, { status: 404 });
    }
    const sessionId = await convexClient.mutation(api.functions.sessions.findOrCreate, {
      gatewayId: gatewayId as Id<"gateways">,
      agentId: channel.agentId,
      channelId: channel._id,
      externalUserId: `hub:${userId}`,
      userId: userId as Id<"authUsers">,
    });
    return NextResponse.json({ sessionId });
  } catch (err) {
    return handleGatewayError(err);
  }
}
