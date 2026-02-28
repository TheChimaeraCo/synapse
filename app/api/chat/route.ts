// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0
import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { createHash } from "crypto";
import { fireWebhook } from "@/lib/webhooks";
import { resolveConversation } from "@/lib/conversationManager";
import { runAgentTurn } from "@/lib/agent-sdk/turn";
import { queueConversationTagger } from "@/lib/conversationTagger";

// Simple request deduplication
const recentRequests = new Map<string, number>();
const DEDUP_WINDOW_MS = 2000;

function isDuplicateRequest(sessionId: string, content: string): boolean {
  const hash = createHash("sha256").update(`${sessionId}|${content}`).digest("hex").slice(0, 16);
  const now = Date.now();
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

export async function POST(req: NextRequest) {
  try {
    const { userId, gatewayId, role } = await getGatewayContext(req);
    const { sessionId, content } = await req.json();

    if (!sessionId || !content?.trim()) {
      return NextResponse.json({ error: "sessionId and content are required" }, { status: 400 });
    }

    if (isDuplicateRequest(sessionId, content.trim())) {
      return NextResponse.json({ error: "Duplicate request" }, { status: 429 });
    }

    const sessionDoc = await convexClient.query(api.functions.sessions.get, {
      id: sessionId as Id<"sessions">,
    });
    if (!sessionDoc) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Resolve conversation
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
        content.trim()
      );
      conversationId = resolved.conversationId;
      segmentationMeta = resolved.segmentation;
    } catch (err) {
      console.error("[ConvoSegmentation] Non-stream route: failed to resolve conversation:", err);
    }

    const messageId = await convexClient.mutation(api.functions.messages.create, {
      gatewayId: gatewayId as Id<"gateways">,
      sessionId: sessionId as Id<"sessions">,
      agentId: sessionDoc.agentId,
      role: "user",
      content: content.trim(),
      conversationId,
      ...(segmentationMeta ? { metadata: { segmentation: segmentationMeta } } : {}),
    });
    queueConversationTagger({
      gatewayId: gatewayId as Id<"gateways">,
      conversationId,
      userMessageId: messageId as Id<"messages">,
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
      content.trim(),
      conversationId,
      messageId as Id<"messages">,
      budgetCheck.suggestedModel || undefined,
      role,
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
  latestUserMessage: string,
  initialConversationId?: Id<"conversations">,
  userMessageId?: Id<"messages">,
  suggestedModel?: string,
  userRole?: "owner" | "admin" | "member" | "viewer",
) {
  const runId = await convexClient.mutation(api.functions.activeRuns.create, {
    gatewayId,
    sessionId,
    status: "thinking",
  });

  let responseConversationId = initialConversationId;
  let usage = { input: 0, output: 0 };
  let modelId = "";

  try {
    await convexClient.mutation(api.functions.activeRuns.updateStatus, { id: runId, status: "streaming" });
    const turn = await runAgentTurn({
      convex: convexClient as any,
      sessionId,
      gatewayId,
      agentId,
      latestUserMessage,
      initialConversationId,
      userMessageId,
      suggestedModel,
      userRole,
      maxToolRounds: 5,
    });
    usage = turn.usage;
    modelId = turn.modelId;
    responseConversationId = turn.responseConversationId;
    const finalContent = turn.content;
    const latencyMs = turn.latencyMs;
    const cost = calculateCost(modelId, usage.input, usage.output);
    const msgId = await convexClient.mutation(api.functions.messages.create, {
      gatewayId, sessionId, agentId,
      role: "assistant", content: finalContent, tokens: usage, cost, model: modelId, latencyMs,
      conversationId: responseConversationId,
    });

    await convexClient.mutation(api.functions.usage.record, {
      gatewayId, agentId, sessionId, messageId: msgId,
      model: modelId, inputTokens: usage.input, outputTokens: usage.output, cost,
    });

    await convexClient.mutation(api.functions.activeRuns.complete, { id: runId });

    fireWebhook(gatewayId as string, "message.created", {
      messageId: msgId, sessionId, role: "assistant", model: modelId, latencyMs, tokens: usage,
    }).catch(console.error);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("processAIResponse error:", errorMsg);
    try {
      await convexClient.mutation(api.functions.messages.create, {
        gatewayId,
        sessionId,
        agentId,
        role: "assistant",
        content: `I hit an error while generating a response: ${errorMsg}`,
        ...(usage.input || usage.output ? { tokens: usage } : {}),
        ...(modelId ? { model: modelId } : {}),
        conversationId: responseConversationId,
      });
    } catch (persistErr) {
      console.error("processAIResponse failed to persist assistant error message:", persistErr);
    }
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
