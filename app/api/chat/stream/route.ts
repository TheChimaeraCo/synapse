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

class ClientAbortError extends Error {
  constructor() {
    super("Client disconnected");
    this.name = "ClientAbortError";
  }
}

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
  try {
    conversationId = await resolveConversation(
      sessionId as Id<"sessions">,
      gatewayId as Id<"gateways">,
      userId ? (userId as Id<"authUsers">) : undefined,
      sanitizedContent
    );
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
      const abortHandler = () => { clientAborted = true; };
      req.signal.addEventListener("abort", abortHandler);
      const throwIfAborted = () => {
        if (clientAborted || req.signal.aborted) throw new ClientAbortError();
      };
      try {
        throwIfAborted();
        controller.enqueue(encoder.encode(sseEvent({ type: "typing", status: true })));
        let responseConversationId = conversationId;

        // Build context
        const { systemPrompt: rawSystemPrompt, messages: claudeMessages } = await buildContext(
          sessionId, sessionDoc.agentId, sanitizedContent, 5000, responseConversationId
        );

        // Layer 4: Embed canary token in system prompt
        const systemPrompt = defenseConfig.enabled
          ? embedCanaryInPrompt(rawSystemPrompt, sessionId as string)
          : rawSystemPrompt;

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
        const [defaultThinkingLevelRaw, responsePrefix] = await Promise.all([
          getGwConfig("models.thinking_level"),
          getGwConfig("messages.response_prefix"),
        ]);

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
        const modelId = selection.model;
        console.log(`[Chat] Using provider=${provider} model=${modelId} agent=${agent.name}`);
        const model = getModel(provider as any, modelId as any);
        if (!model) throw new Error(`Model "${modelId}" not found`);

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
        options.signal = req.signal;
        if (agent.temperature !== undefined) options.temperature = agent.temperature;

        // Cache check
        const lastUserMsg = claudeMessages.filter((m: any) => m.role === "user").pop();
        // Disable response cache - tools are always available (builtins),
        // and caching breaks conversation context (same message in different convos = different answer)
        const cacheHash = null;

        if (cacheHash) {
          const cached = await convexClient.query(api.functions.responseCache.getCached, { hash: cacheHash });
          if (cached) {
            controller.enqueue(encoder.encode(sseEvent({ type: "token", content: cached.response })));
            const msgId = await convexClient.mutation(api.functions.messages.create, {
              gatewayId: gatewayId as Id<"gateways">, sessionId: sessionId as Id<"sessions">, agentId: sessionDoc.agentId,
              role: "assistant", content: cached.response, tokens: cached.tokens, cost: cached.cost, model: cached.model, latencyMs: 0,
              conversationId: responseConversationId,
            });
            controller.enqueue(encoder.encode(sseEvent({ type: "done", messageId: msgId })));
            controller.close();
            return;
          }
        }

        const startMs = Date.now();
        let fullContent = "";
        const trimmedPrefix = (responsePrefix || "").trim();
        if (trimmedPrefix) {
          const prefixText = `${trimmedPrefix} `;
          fullContent = prefixText;
          controller.enqueue(encoder.encode(sseEvent({ type: "token", content: prefixText })));
        }
        let usage = { input: 0, output: 0 };
        let streamedTokenEstimate = 0;
        let movedUserMessageToNewConversation = false;
        const MAX_TOOL_ROUNDS = 5;

        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          throwIfAborted();
          const toolCalls: Array<{ type: "toolCall"; id: string; name: string; arguments: Record<string, any> }> = [];
          let roundText = "";

          const aiStream = streamSimple(model, context, options);
          for await (const event of aiStream) {
            if (clientAborted || req.signal.aborted) {
              if (typeof (aiStream as any).return === "function") {
                try { await (aiStream as any).return(); } catch {}
              }
              throw new ClientAbortError();
            }
            if (event.type === "text_delta") {
              // Post-process: replace em dashes with hyphens
              const cleanDelta = event.delta.replace(/—/g, " - ");
              roundText += cleanDelta;
              // Rough token estimate: ~4 chars per token
              streamedTokenEstimate += Math.ceil(cleanDelta.length / 4);
              controller.enqueue(encoder.encode(sseEvent({ type: "token", content: cleanDelta })));
              // Send token count update every ~20 tokens
              if (streamedTokenEstimate % 20 < 5) {
                controller.enqueue(encoder.encode(sseEvent({ type: "token_count", estimated: streamedTokenEstimate })));
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
            controller.enqueue(encoder.encode(sseEvent({ type: "tool_start", tool: tc.name, args: Object.keys(tc.arguments) })));
          }
          controller.enqueue(encoder.encode(sseEvent({ type: "tool_use", tools: toolCalls.map(t => t.name) })));

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
              controller.enqueue(encoder.encode(sseEvent({ type: "agent_start", agentId: wId, label: tc.name })));
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
              controller.enqueue(encoder.encode(sseEvent({ type: "agent_complete", agentId: wId })));
            } catch {}
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
            controller.enqueue(encoder.encode(sseEvent({ type: "clear" })));
            controller.enqueue(encoder.encode(sseEvent({ type: "token", content: fullContent })));
          }
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

        controller.enqueue(encoder.encode(sseEvent({ type: "done", messageId: msgId, tokens: usage, cost })));

      } catch (err: any) {
        if (err instanceof ClientAbortError || req.signal.aborted) {
          console.log("[ChatStream] Client aborted request; stopping generation early.");
          return;
        }
        console.error("SSE stream error:", err);
        try {
          controller.enqueue(encoder.encode(sseEvent({ type: "error", message: err.message || "Stream error" })));
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
