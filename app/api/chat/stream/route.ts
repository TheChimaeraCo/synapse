import { NextRequest } from "next/server";
import { getGatewayContext, GatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildContext } from "@/lib/contextBuilder";
import { executeTools, toProviderTools } from "@/lib/toolExecutor";
import { parseSlashCommand } from "@/lib/slashCommands";
import { getThinkingParams, isValidThinkingLevel, type ThinkingLevel } from "@/lib/thinkingLevels";
import { resolveConversation } from "@/lib/conversationManager";
import { createHash } from "crypto";
import { runInputDefense, runOutputDefense, parseDefenseConfig, embedCanaryInPrompt } from "@/lib/promptDefense";
import { applyResponsePrefix } from "@/lib/messageFormatting";
import { resolveAiSelection } from "@/lib/aiRouting";
import { defaultModelForProvider } from "@/lib/aiRoutingConfig";
import { queueConversationTagger } from "@/lib/conversationTagger";

// Simple request deduplication: track recent request hashes to prevent double-sends
const recentRequests = new Map<string, number>();
const DEDUP_WINDOW_MS = 2000;

function isDuplicateRequest(sessionId: string, content: string): boolean {
  const hash = createHash("sha256").update(`${sessionId}|${content}`).digest("hex").slice(0, 16);
  const now = Date.now();
  // Clean old entries
  for (const [k, v] of recentRequests) {
    if (now - v > DEDUP_WINDOW_MS) recentRequests.delete(k);
  }
  if (recentRequests.has(hash)) return true;
  recentRequests.set(hash, now);
  return false;
}

const MODEL_COSTS: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "claude-sonnet-4-20250514": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-opus-4-20250514": { inputPerMillion: 15, outputPerMillion: 75 },
  "claude-haiku-3-20250514": { inputPerMillion: 0.25, outputPerMillion: 1.25 },
};

function calculateCost(model: string, input: number, output: number): number {
  const costs = MODEL_COSTS[model] || { inputPerMillion: 3, outputPerMillion: 15 };
  return (input / 1_000_000 * costs.inputPerMillion) + (output / 1_000_000 * costs.outputPerMillion);
}

function sseEvent(data: Record<string, any>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function buildToolFallbackMessage(
  toolLogs: Array<{ tool: string; summary: string; isError: boolean }>
): string {
  if (!toolLogs.length) {
    return "I couldn't produce a final response this turn. Ask me to continue and I'll pick it up.";
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

function isUnderspecifiedFollowup(content: string): boolean {
  const text = content.trim().toLowerCase();
  if (!text || text.length > 120) return false;

  const quickFollowups = new Set([
    "continue",
    "go ahead",
    "do it",
    "try again",
    "yes",
    "yep",
    "ok",
    "okay",
    "sounds good",
  ]);
  if (quickFollowups.has(text)) return true;

  const hasActionVerb = /\b(can|could|please|do|run|check|look|research|analyze|summarize|add|fix|update|make|continue|retry)\b/.test(text);
  const hasReferentialLanguage = /\b(this|that|it|them|those|same|again|another|more|for me)\b/.test(text);
  const hasGenericResearchAsk = /\b(do some research|research for me|look into (it|this|that))\b/.test(text);

  return (hasActionVerb && hasReferentialLanguage) || hasGenericResearchAsk;
}

class ClientAbortError extends Error {
  constructor() {
    super("Client disconnected");
    this.name = "ClientAbortError";
  }
}

const CONTINUE_ON_DISCONNECT = process.env.CHAT_CONTINUE_ON_DISCONNECT !== "false";

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await getGatewayContext(req);
  } catch (err) {
    const status = err instanceof GatewayError ? err.statusCode : 401;
    const message = err instanceof Error ? err.message : "Unauthorized";
    return new Response(JSON.stringify({ error: message }), { status });
  }

  const { sessionId, content, gatewayId: bodyGatewayId } = await req.json();
  const userId = ctx.userId;
  const gatewayId = ctx.gatewayId;

  if (!sessionId || !content?.trim()) {
    return new Response(JSON.stringify({ error: "sessionId and content are required" }), { status: 400 });
  }

  // Dedup check
  if (isDuplicateRequest(sessionId, content.trim())) {
    return new Response(JSON.stringify({ error: "Duplicate request" }), { status: 429 });
  }

  // === Prompt Defense: Input validation ===
  let defenseConfigRaw: Record<string, string> = {};
  try {
    defenseConfigRaw = await convexClient.query(api.functions.gatewayConfig.getMultiple, {
      gatewayId: gatewayId as Id<"gateways">,
      keys: ["security_defense_enabled", "security_max_input_length", "security_rate_limit_per_minute", "security_threat_threshold"],
    });
  } catch {
    defenseConfigRaw = await convexClient.query(api.functions.config.getMultiple, {
      keys: ["security_defense_enabled", "security_max_input_length", "security_rate_limit_per_minute", "security_threat_threshold"],
    });
  }
  const defenseConfig = parseDefenseConfig(defenseConfigRaw);

  const inputDefense = runInputDefense(userId, content.trim(), "user", defenseConfig);
  if (!inputDefense.allowed) {
    console.warn(`[DEFENSE] Blocked input from ${userId}: ${inputDefense.blocked}`, { flags: inputDefense.flags, score: inputDefense.threatScore });
    return new Response(JSON.stringify({ error: "Message blocked by security policy", reason: inputDefense.blocked }), { status: 403 });
  }
  // Use sanitized content from here on
  const sanitizedContent = inputDefense.sanitizedContent || content.trim();

  // Check slash commands first
  const cmdResult = parseSlashCommand(sanitizedContent);
  if (cmdResult.handled) {
    // Handle side effects
    if (cmdResult.action === "set_thinking" && cmdResult.args?.level) {
      await convexClient.mutation(api.functions.sessions.updateMeta, {
        id: sessionId as Id<"sessions">,
        meta: { thinkingLevel: cmdResult.args.level },
      });
    }

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(sseEvent({ type: "command", command: cmdResult.command, action: cmdResult.action, args: cmdResult.args })));
        if (cmdResult.response) {
          controller.enqueue(encoder.encode(sseEvent({ type: "token", content: cmdResult.response })));
        }
        controller.enqueue(encoder.encode(sseEvent({ type: "done" })));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Get session doc
  const sessionDoc = await convexClient.query(api.functions.sessions.get, {
    id: sessionId as Id<"sessions">,
  });
  if (!sessionDoc) {
    return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
  }

  // Resolve conversation (creates or continues based on topic/timeout)
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
    const resolved = await resolveConversation(
      sessionId as Id<"sessions">,
      gatewayId as Id<"gateways">,
      userId ? (userId as Id<"authUsers">) : undefined,
      sanitizedContent
    );
    conversationId = resolved.conversationId;
    segmentationMeta = resolved.segmentation;
    console.log(`[ConvoSegmentation] Resolved conversation: ${conversationId}`);
  } catch (err) {
    console.error("[ConvoSegmentation] Failed to resolve conversation, continuing without:", err);
  }

  // Create user message (seq auto-assigned by Convex)
  const messageId = await convexClient.mutation(api.functions.messages.create, {
    gatewayId: gatewayId as Id<"gateways">,
    sessionId: sessionId as Id<"sessions">,
    agentId: sessionDoc.agentId,
    role: "user",
    content: sanitizedContent,
    conversationId,
    ...(segmentationMeta ? { metadata: { segmentation: segmentationMeta } } : {}),
  });
  queueConversationTagger({
    gatewayId: gatewayId as Id<"gateways">,
    conversationId,
    userMessageId: messageId as Id<"messages">,
  });

  // Budget check
  const budgetCheck = await convexClient.query(api.functions.usage.checkBudget, {
    gatewayId: gatewayId as Id<"gateways">,
  });

  if (!budgetCheck.allowed) {
    const blockedMsg = `I'm unable to respond right now. ${budgetCheck.reason || "Budget limit reached."} Please check your budget settings or try again later.`;
    await convexClient.mutation(api.functions.messages.create, {
      gatewayId: gatewayId as Id<"gateways">,
      sessionId: sessionId as Id<"sessions">,
      agentId: sessionDoc.agentId,
      role: "assistant",
      content: blockedMsg,
    });

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(sseEvent({ type: "error", message: blockedMsg })));
        controller.enqueue(encoder.encode(sseEvent({ type: "done", messageId })));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  // Stream the AI response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let clientAborted = req.signal.aborted;
      let streamWritable = !clientAborted;
      const abortHandler = () => {
        clientAborted = true;
        streamWritable = false;
        if (CONTINUE_ON_DISCONNECT) {
          console.log("[ChatStream] Client disconnected; continuing generation on server.");
        }
      };
      req.signal.addEventListener("abort", abortHandler);
      const throwIfAborted = () => {
        if (!CONTINUE_ON_DISCONNECT && (clientAborted || req.signal.aborted)) throw new ClientAbortError();
      };
      const emit = (payload: Record<string, any>) => {
        if (!streamWritable) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(payload)));
        } catch {
          streamWritable = false;
        }
      };

      let responseConversationId = conversationId;
      let responsePrefix: string | null = null;
      let modelId = "";
      let fullContent = "";
      let usage = { input: 0, output: 0 };
      let streamedTokenEstimate = 0;
      let generatedAnyAssistantText = false;
      let assistantPersisted = false;
      const toolLogsForFallback: Array<{ tool: string; summary: string; isError: boolean }> = [];

      try {
        throwIfAborted();
        emit({ type: "typing", status: true });

        // Build context
        const { systemPrompt: rawSystemPrompt, messages: claudeMessages } = await buildContext(
          sessionId, sessionDoc.agentId, sanitizedContent, 5000, responseConversationId
        );

        const userTurns = claudeMessages.filter((m) => m.role === "user");
        const previousUserTurn = userTurns.length >= 2 ? userTurns[userTurns.length - 2]?.content : null;
        const shouldApplyContinuityGuard =
          isUnderspecifiedFollowup(sanitizedContent) &&
          Boolean(previousUserTurn);

        const continuityGuard = shouldApplyContinuityGuard
          ? `\n\n## Continuity Guard\nThe latest user message is a short follow-up.\nInfer the subject from the immediately previous user turn before asking clarification.\nOnly ask a clarifying question if two or more distinct subjects are equally plausible.\nMost likely subject from previous user turn: "${String(previousUserTurn).slice(0, 260)}"`
          : "";

        const augmentedSystemPrompt = rawSystemPrompt + continuityGuard;

        // Layer 4: Embed canary token in system prompt
        const systemPrompt = defenseConfig.enabled
          ? embedCanaryInPrompt(augmentedSystemPrompt, sessionId as string)
          : augmentedSystemPrompt;

        const agent = await convexClient.query(api.functions.agents.get, { id: sessionDoc.agentId });
        if (!agent) throw new Error("Agent not found");

        // Get AI config (gateway-scoped with inheritance)
        const getGwConfig = async (key: string) => {
          try {
            const result = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
              gatewayId: gatewayId as Id<"gateways">, key,
            });
            return result?.value || null;
          } catch {
            return await convexClient.query(api.functions.config.get, { key });
          }
        };
        const [defaultThinkingLevelRaw, loadedResponsePrefix] = await Promise.all([
          getGwConfig("models.thinking_level"),
          getGwConfig("messages.response_prefix"),
        ]);
        responsePrefix = loadedResponsePrefix;

        const { registerBuiltInApiProviders, getModel, streamSimple } = await import("@mariozechner/pi-ai");
        registerBuiltInApiProviders();

        const enabledTools = await convexClient.query(api.functions.tools.getEnabled, { gatewayId: gatewayId as Id<"gateways"> });
        const customRoutes = await convexClient.query(api.functions.modelRoutes.list, { gatewayId: gatewayId as Id<"gateways"> });
        
        // Always include builtin tools - use DB tools if they exist, otherwise fallback to builtins
        const { BUILTIN_TOOLS } = await import("@/lib/builtinTools");
        const builtinToolDefs = BUILTIN_TOOLS.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
        // Always include builtins, merge with any DB-defined tools
        const dbToolNames = new Set(enabledTools.map((t: any) => t.name));
        const allToolDefs = [
          ...builtinToolDefs.filter(t => !dbToolNames.has(t.name)),
          ...enabledTools,
        ];
        const providerTools = toProviderTools(allToolDefs);
        const budgetState = {
          allowed: true,
          suggestedModel: budgetCheck.suggestedModel || undefined,
          remainingUsd: undefined as number | undefined,
        };
        const selection = await resolveAiSelection({
          gatewayId: gatewayId as Id<"gateways">,
          capability: "chat",
          message: sanitizedContent,
          agentModel: agent.model || undefined,
          budget: budgetState,
          customRoutes: customRoutes as any,
        });
        const provider = selection.provider;
        const key = selection.apiKey;
        if (!key) throw new Error("No API key configured");
        modelId = selection.model;
        let model = getModel(provider as any, modelId as any);
        if (!model) {
          const fallbackModelId = defaultModelForProvider(provider);
          const fallbackModel = getModel(provider as any, fallbackModelId as any);
          if (!fallbackModel) throw new Error(`Model "${modelId}" not found`);
          console.warn(`[Chat] Model "${modelId}" not found for provider=${provider}; falling back to ${fallbackModelId}`);
          modelId = fallbackModelId;
          model = fallbackModel;
        }
        console.log(`[Chat] Using provider=${provider} model=${modelId} agent=${agent.name}`);

        // Get thinking level from session metadata
        const defaultThinkingLevel = (defaultThinkingLevelRaw || "off").toLowerCase();
        const requestedThinking = String((sessionDoc as any).meta?.thinkingLevel || defaultThinkingLevel || "off").toLowerCase();
        const thinkingLevel: ThinkingLevel = isValidThinkingLevel(requestedThinking) ? requestedThinking : "off";
        const thinkingParams = getThinkingParams(thinkingLevel, provider);

        // Transform messages, converting file references to inline vision content for images
        const FILE_REF_RE = /\[file:([^\]:]+):([^\]]+)\]/g;
        const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
        const IMAGE_MIMES: Record<string, string> = {
          jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
          gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
        };

        // Pre-fetch image files from Convex storage for inline vision
        const fetchImageAsBase64 = async (fileId: string): Promise<{ b64: string; mime: string } | null> => {
          try {
            const { getFileWithFreshUrl } = await import("@/lib/uploadedFileReader");
            const resolved = await getFileWithFreshUrl(fileId as any);
            if (!resolved?.url) return null;
            const imgRes = await fetch(resolved.url);
            if (!imgRes.ok) return null;
            const buf = Buffer.from(await imgRes.arrayBuffer());
            const mime = imgRes.headers.get("content-type") || resolved.file?.mimeType || "image/png";
            return { b64: buf.toString("base64"), mime };
          } catch (e) {
            console.error(`[Chat] Failed to fetch image ${fileId}:`, e);
            return null;
          }
        };

        const transformMessage = async (m: any) => {
          if (m.role !== "user") {
            return { role: "assistant" as const, content: [{ type: "text" as const, text: m.content }], timestamp: Date.now() };
          }
          const fileRefs: { id: string; filename: string }[] = [];
          let match;
          const re = new RegExp(FILE_REF_RE);
          while ((match = re.exec(m.content)) !== null) {
            fileRefs.push({ id: match[1], filename: match[2] });
          }
          const textContent = m.content.replace(FILE_REF_RE, "").trim();
          const imageRefs = fileRefs.filter(f => IMAGE_EXTS.test(f.filename));
          const nonImageRefs = fileRefs.filter(f => !IMAGE_EXTS.test(f.filename));

          // If no image refs, return simple text message
          if (imageRefs.length === 0) {
            const fileContextLines = nonImageRefs.map(f => `Attached file: ${f.filename} (id: ${f.id})`);
            const mergedText = [textContent, fileContextLines.join("\n")].filter(Boolean).join("\n\n").trim();
            return { role: "user" as const, content: mergedText || m.content, timestamp: Date.now() };
          }

          // Fetch images and build multimodal content blocks
          const contentParts: any[] = [];
          for (const imgRef of imageRefs) {
            const img = await fetchImageAsBase64(imgRef.id);
            if (img) {
              contentParts.push({
                type: "image",
                data: img.b64,
                mimeType: img.mime,
              });
              console.log(`[Chat] Inlined image: ${imgRef.filename} (${Math.round(img.b64.length / 1024)}KB b64)`);
            } else {
              contentParts.push({ type: "text", text: `[Failed to load image: ${imgRef.filename}]` });
            }
          }

          // Add non-image file references as text
          const fileContextLines = nonImageRefs.map(f => `Attached file: ${f.filename} (id: ${f.id})`);
          const finalText = [textContent, fileContextLines.join("\n")].filter(Boolean).join("\n\n").trim();
          if (finalText) {
            contentParts.push({ type: "text", text: finalText });
          }

          return { role: "user" as const, content: contentParts, timestamp: Date.now() };
        };

        const context: any = {
          systemPrompt,
          messages: await Promise.all(claudeMessages.map(transformMessage)),
          ...(providerTools ? { tools: providerTools } : {}),
        };

        const options: any = { maxTokens: agent.maxTokens || 4096, apiKey: key, ...thinkingParams };
        if (!CONTINUE_ON_DISCONNECT) options.signal = req.signal;
        if (agent.temperature !== undefined) options.temperature = agent.temperature;

        // Cache check
        const lastUserMsg = claudeMessages.filter((m: any) => m.role === "user").pop();
        // Disable response cache - tools are always available (builtins),
        // and caching breaks conversation context (same message in different convos = different answer)
        const cacheHash = null;

        if (cacheHash) {
          const cached = await convexClient.query(api.functions.responseCache.getCached, { hash: cacheHash });
          if (cached) {
            emit({ type: "token", content: cached.response });
            const msgId = await convexClient.mutation(api.functions.messages.create, {
              gatewayId: gatewayId as Id<"gateways">, sessionId: sessionId as Id<"sessions">, agentId: sessionDoc.agentId,
              role: "assistant", content: cached.response, tokens: cached.tokens, cost: cached.cost, model: cached.model, latencyMs: 0,
              conversationId: responseConversationId,
            });
            emit({ type: "done", messageId: msgId });
            controller.close();
            return;
          }
        }

        const startMs = Date.now();
        const trimmedPrefix = (responsePrefix || "").trim();
        if (trimmedPrefix) {
          const prefixText = `${trimmedPrefix} `;
          fullContent = prefixText;
          emit({ type: "token", content: prefixText });
        }
        let movedUserMessageToNewConversation = false;
        const MAX_TOOL_ROUNDS = 25;

        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          throwIfAborted();
          const toolCalls: Array<{ type: "toolCall"; id: string; name: string; arguments: Record<string, any> }> = [];
          let roundText = "";

          const aiStream = streamSimple(model, context, options);
          for await (const event of aiStream) {
            if (clientAborted || req.signal.aborted) {
              streamWritable = false;
              if (!CONTINUE_ON_DISCONNECT) {
                if (typeof (aiStream as any).return === "function") {
                  try { await (aiStream as any).return(); } catch {}
                }
                throw new ClientAbortError();
              }
            }
            if (event.type === "text_delta") {
              // Post-process: replace em dashes with hyphens
              const cleanDelta = event.delta.replace(/—/g, " - ");
              roundText += cleanDelta;
              if (cleanDelta.trim().length > 0) generatedAnyAssistantText = true;
              // Rough token estimate: ~4 chars per token
              streamedTokenEstimate += Math.ceil(cleanDelta.length / 4);
              emit({ type: "token", content: cleanDelta });
              // Send token count update every ~20 tokens
              if (streamedTokenEstimate % 20 < 5) {
                emit({ type: "token_count", estimated: streamedTokenEstimate });
              }
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
          throwIfAborted();

          // Stream individual tool call notifications
          for (const tc of toolCalls) {
            emit({ type: "tool_start", tool: tc.name, args: Object.keys(tc.arguments) });
          }
          emit({ type: "tool_use", tools: toolCalls.map(t => t.name) });

          // Create worker agent records for each tool call
          const workerIds: string[] = [];
          for (const tc of toolCalls) {
            try {
              const wId = await convexClient.mutation(api.functions.workerAgents.create, {
                parentSessionId: sessionId as Id<"sessions">,
                gatewayId: gatewayId as Id<"gateways">,
                label: tc.name,
                model: modelId,
                context: JSON.stringify(tc.arguments).slice(0, 200),
              });
              workerIds.push(wId);
              emit({ type: "agent_start", agentId: wId, label: tc.name });
            } catch { workerIds.push(""); }
          }

          const toolContext = {
            gatewayId: gatewayId as string,
            agentId: sessionDoc.agentId as string,
            sessionId: sessionId as string,
            userId: userId as string,
            userRole: ctx.role,
          };
          const toolResults = await executeTools(toolCalls, toolContext, enabledTools as any);
          throwIfAborted();
          const switchedConvoId = (toolContext as any).__newConversationId as Id<"conversations"> | undefined;
          if (switchedConvoId) {
            responseConversationId = switchedConvoId;
            delete (toolContext as any).__newConversationId;
            console.log(`[ConvoSegmentation] Tool requested conversation switch -> ${responseConversationId}`);
            if (!movedUserMessageToNewConversation) {
              try {
                await convexClient.mutation(api.functions.messages.updateConversationId, {
                  id: messageId as Id<"messages">,
                  conversationId: responseConversationId,
                });
                movedUserMessageToNewConversation = true;
              } catch (err) {
                console.error("[ConvoSegmentation] Failed to move triggering user message:", err);
              }
            }
          }

          // Complete worker agents
          for (let i = 0; i < toolResults.length; i++) {
            const wId = workerIds[i];
            if (!wId) continue;
            try {
              await convexClient.mutation(api.functions.workerAgents.complete, {
                id: wId as Id<"workerAgents">,
                status: toolResults[i].isError ? "failed" : "completed",
                result: toolResults[i].content.slice(0, 500),
                error: toolResults[i].isError ? toolResults[i].content.slice(0, 300) : undefined,
              });
              emit({ type: "agent_complete", agentId: wId });
            } catch {}
            // Stream tool result summary to UI
            emit({
              type: "tool_result",
              tool: toolCalls[i]?.name || "unknown",
              success: !toolResults[i].isError,
              summary: toolResults[i].content.slice(0, 200),
              round: round + 1,
            });
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

          // Topic segmentation is handled before message insert via resolveConversation.
        }

        const latencyMs = Date.now() - startMs;
        throwIfAborted();

        // === Prompt Defense: Output validation ===
        if (defenseConfig.enabled && fullContent) {
          const outputDefense = runOutputDefense(fullContent, sessionId as string, defenseConfig);
          if (!outputDefense.allowed) {
            console.warn(`[DEFENSE] Blocked output for session ${sessionId}: ${outputDefense.blocked}`, { flags: outputDefense.flags });
            fullContent = "I'm sorry, but I can't provide that response due to security constraints.";
            generatedAnyAssistantText = true;
            emit({ type: "clear" });
            emit({ type: "token", content: fullContent });
          }
        }

        if (!generatedAnyAssistantText) {
          fullContent = buildToolFallbackMessage(toolLogsForFallback);
          emit({ type: "clear" });
          emit({ type: "token", content: fullContent });
        }

        const cost = calculateCost(modelId, usage.input, usage.output);

        const finalContent = applyResponsePrefix(fullContent, responsePrefix);
        const msgId = await convexClient.mutation(api.functions.messages.create, {
          gatewayId: gatewayId as Id<"gateways">,
          sessionId: sessionId as Id<"sessions">,
          agentId: sessionDoc.agentId,
          role: "assistant",
          content: finalContent,
          tokens: usage,
          cost,
          model: modelId,
          latencyMs,
          conversationId: responseConversationId,
        });
        assistantPersisted = true;

        await convexClient.mutation(api.functions.usage.record, {
          gatewayId: gatewayId as Id<"gateways">,
          agentId: sessionDoc.agentId,
          sessionId: sessionId as Id<"sessions">,
          messageId: msgId,
          model: modelId,
          inputTokens: usage.input,
          outputTokens: usage.output,
          cost,
        });

        if (cacheHash && enabledTools.length === 0) {
          await convexClient.mutation(api.functions.responseCache.setCache, {
            hash: cacheHash, response: fullContent, model: modelId, tokens: usage, cost,
          });
        }

        emit({ type: "done", messageId: msgId, tokens: usage, cost });

      } catch (err: any) {
        if (err instanceof ClientAbortError || (!CONTINUE_ON_DISCONNECT && req.signal.aborted)) {
          console.log("[ChatStream] Client aborted request; stopping generation early.");
          if (!CONTINUE_ON_DISCONNECT && !assistantPersisted && generatedAnyAssistantText && fullContent.trim().length > 0) {
            try {
              const partialContent = `${applyResponsePrefix(fullContent, responsePrefix)}\n\n[Response interrupted: client disconnected]`;
              await convexClient.mutation(api.functions.messages.create, {
                gatewayId: gatewayId as Id<"gateways">,
                sessionId: sessionId as Id<"sessions">,
                agentId: sessionDoc.agentId,
                role: "assistant",
                content: partialContent,
                ...(usage.input || usage.output ? { tokens: usage } : {}),
                ...(modelId ? { model: modelId } : {}),
                conversationId: responseConversationId,
              });
            } catch (persistErr) {
              console.error("[ChatStream] Failed to persist partial response after abort:", persistErr);
            }
          }
          return;
        }
        console.error("SSE stream error:", err);
        if (!assistantPersisted) {
          try {
            await convexClient.mutation(api.functions.messages.create, {
              gatewayId: gatewayId as Id<"gateways">,
              sessionId: sessionId as Id<"sessions">,
              agentId: sessionDoc.agentId,
              role: "assistant",
              content: `I hit an error while generating a response: ${err?.message || "Unknown stream error"}`,
              ...(usage.input || usage.output ? { tokens: usage } : {}),
              ...(modelId ? { model: modelId } : {}),
              conversationId: responseConversationId,
            });
          } catch (persistErr) {
            console.error("[ChatStream] Failed to persist stream error message:", persistErr);
          }
        }
        try {
          emit({ type: "error", message: err.message || "Stream error" });
        } catch {}
      } finally {
        req.signal.removeEventListener("abort", abortHandler);
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
