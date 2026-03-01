import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildContext } from "@/lib/contextBuilder";
import { executeTools, toProviderTools } from "@/lib/toolExecutor";
import { applyResponsePrefix } from "@/lib/messageFormatting";
import { resolveAiSelection } from "@/lib/aiRouting";
import { defaultModelForProvider } from "@/lib/aiRoutingConfig";
import { BUILTIN_TOOLS } from "@/lib/builtinTools";
import type { TaskType } from "@/lib/modelRouter";

export interface RunAgentTurnParams {
  convex: ConvexHttpClient;
  sessionId: Id<"sessions">;
  gatewayId: Id<"gateways">;
  agentId: Id<"agents">;
  latestUserMessage: string;
  initialConversationId?: Id<"conversations">;
  userMessageId?: Id<"messages">;
  suggestedModel?: string;
  userRole?: "owner" | "admin" | "member" | "viewer";
  maxToolRounds?: number;
}

export interface RunAgentTurnResult {
  content: string;
  usage: { input: number; output: number };
  modelId: string;
  latencyMs: number;
  responseConversationId?: Id<"conversations">;
}

function buildNoOutputRecoveryMessage(userMessage?: string): string {
  const text = (userMessage || "").trim().toLowerCase();

  if (/\b(continue|go ahead|retry|try again)\b/.test(text)) {
    return "There isn't a pending partial response to continue. Please resend the full request and I'll run it now.";
  }

  if (/\b(look up|lookup|find|search|research)\b/.test(text)) {
    if (/\bliquidation\b.*\bpallet|\bpallet\b.*\bliquidation\b/.test(text)) {
      return "I can do that. Share your target category, budget, and location, and I'll pull live liquidation pallet sources and listings.";
    }
    return "I can run that lookup. Please share the exact target, budget, and location so I can return concrete listings.";
  }

  return "I didn't receive a usable model output for that turn. Please resend your full request and I'll handle it directly.";
}

function buildToolFallbackMessage(
  toolLogs: Array<{ tool: string; summary: string; isError: boolean }>,
  userMessage?: string
): string {
  if (!toolLogs.length) {
    return buildNoOutputRecoveryMessage(userMessage);
  }

  const successful = toolLogs.filter((t) => !t.isError).slice(-4);
  if (successful.length > 0) {
    const lines = successful.map((t) => `- ${t.tool}: ${t.summary}`);
    return [
      "I completed tool work but didn't produce a final narrative response.",
      "Key results:",
      ...lines,
    ].join("\n");
  }

  const failed = toolLogs.filter((t) => t.isError).slice(-4);
  const errorLines = failed.map((t) => `- ${t.tool}: ${t.summary}`);
  return [
    "I couldn't produce a final response because tool calls failed.",
    "Last errors:",
    ...errorLines,
  ].join("\n");
}

async function getConfig(convex: ConvexHttpClient, gatewayId: Id<"gateways">, key: string) {
  try {
    const result = await convex.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId,
      key,
    });
    return result?.value || null;
  } catch {
    return await convex.query(api.functions.config.get, { key });
  }
}

export async function runAgentTurn(params: RunAgentTurnParams): Promise<RunAgentTurnResult> {
  const {
    convex,
    sessionId,
    gatewayId,
    agentId,
    latestUserMessage,
    initialConversationId,
    userMessageId,
    suggestedModel,
    userRole,
    maxToolRounds = 5,
  } = params;

  let responseConversationId = initialConversationId;
  const { systemPrompt, messages: claudeMessages } = await buildContext(
    sessionId,
    agentId,
    latestUserMessage,
    5000,
    responseConversationId
  );

  const agent = await convex.query(api.functions.agents.get, { id: agentId });
  if (!agent) throw new Error("Agent not found");

  const responsePrefix = await getConfig(convex, gatewayId, "messages.response_prefix");

  const { registerBuiltInApiProviders, getModel, streamSimple } = await import("@mariozechner/pi-ai");
  registerBuiltInApiProviders();

  const enabledTools = await convex.query(api.functions.tools.getEnabled, { gatewayId });
  const customRoutes = await convex.query(api.functions.modelRoutes.list, { gatewayId });
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
  const providerTools = toProviderTools(allToolDefs);
  const taskType: TaskType = "tool_use";

  const budgetState = {
    allowed: true,
    suggestedModel,
    remainingUsd: undefined as number | undefined,
  };

  const selection = await resolveAiSelection({
    gatewayId,
    capability: taskType,
    message: latestUserMessage,
    agentModel: agent.model || undefined,
    budget: budgetState,
    customRoutes: customRoutes as any,
  });

  const provider = selection.provider;
  const key = selection.apiKey;
  if (!key) throw new Error("No API key configured");

  let modelId = selection.model;
  let model = getModel(provider as any, modelId as any);
  if (!model) {
    const fallbackModelId = defaultModelForProvider(provider);
    const fallbackModel = getModel(provider as any, fallbackModelId as any);
    if (!fallbackModel) throw new Error(`Model "${modelId}" not found`);
    console.warn(`[AgentSDK] Model "${modelId}" not found for provider=${provider}; falling back to ${fallbackModelId}`);
    modelId = fallbackModelId;
    model = fallbackModel;
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

  const startMs = Date.now();
  const usage = { input: 0, output: 0 };
  const toolLogsForFallback: Array<{ tool: string; summary: string; isError: boolean }> = [];
  let generatedAnyAssistantText = false;
  let fullContent = "";
  let movedUserMessageToNewConversation = false;

  for (let round = 0; round <= maxToolRounds; round++) {
    const toolCalls: Array<{ type: "toolCall"; id: string; name: string; arguments: Record<string, any> }> = [];
    let roundText = "";

    const stream = streamSimple(model, context, options);
    for await (const event of stream) {
      if (event.type === "text_delta") {
        const cleanDelta = event.delta.replace(/—/g, " - ");
        roundText += cleanDelta;
        if (cleanDelta.trim().length > 0) generatedAnyAssistantText = true;
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
      userRole,
    };
    const toolResults = await executeTools(toolCalls, toolContext, allToolDefs as any);

    const switchedConvoId = (toolContext as any).__newConversationId as Id<"conversations"> | undefined;
    if (switchedConvoId) {
      responseConversationId = switchedConvoId;
      delete (toolContext as any).__newConversationId;
      if (userMessageId && !movedUserMessageToNewConversation) {
        try {
          await convex.mutation(api.functions.messages.updateConversationId, {
            id: userMessageId,
            conversationId: responseConversationId,
          });
          movedUserMessageToNewConversation = true;
        } catch (err) {
          console.error("[AgentSDK] Failed to move triggering user message:", err);
        }
      }
    }

    for (const result of toolResults) {
      toolLogsForFallback.push({
        tool: result.toolName,
        summary: result.content.slice(0, 200),
        isError: result.isError,
      });
      if (toolLogsForFallback.length > 20) toolLogsForFallback.shift();
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

  if (!generatedAnyAssistantText) {
    fullContent = buildToolFallbackMessage(toolLogsForFallback, latestUserMessage);
  }

  return {
    content: applyResponsePrefix(fullContent, responsePrefix),
    usage,
    modelId,
    latencyMs: Date.now() - startMs,
    responseConversationId,
  };
}
