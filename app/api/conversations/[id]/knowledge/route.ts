import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getGatewayContext(req);
    const { id } = await params;
    const conversationId = id as Id<"conversations">;
    const conversation = await convexClient.query(api.functions.conversations.get, {
      id: conversationId,
    });
    if (!conversation) return NextResponse.json({ entries: [] });

    const [session, messages] = await Promise.all([
      convexClient.query(api.functions.sessions.get, { id: conversation.sessionId }),
      convexClient.query(api.functions.messages.listByConversation, {
        conversationId,
        limit: 300,
      }),
    ]);

    if (!session?.agentId) return NextResponse.json({ entries: [] });

    const knowledge = await convexClient.query(api.functions.knowledge.getRelevant, {
      agentId: session.agentId,
      userId: session.externalUserId,
      limit: 500,
    });

    const messageById = new Map<string, { _id: string; role: string; content: string; createdAt: number }>();
    for (const msg of messages || []) {
      messageById.set(String(msg._id), {
        _id: String(msg._id),
        role: msg.role,
        content: msg.content,
        createdAt: msg._creationTime,
      });
    }

    const entries = (knowledge || [])
      .filter((entry: any) => entry?.sourceMessageId && messageById.has(String(entry.sourceMessageId)))
      .map((entry: any) => ({
        _id: entry._id,
        category: entry.category,
        key: entry.key,
        value: entry.value,
        confidence: entry.confidence,
        source: entry.source,
        sourceMessageId: entry.sourceMessageId,
        sourceType: entry.source === "conversation_summary" ? "conversation" : "message",
        sourceMessage: messageById.get(String(entry.sourceMessageId)) || null,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      }))
      .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 200);

    return NextResponse.json({ entries });
  } catch (err) {
    return handleGatewayError(err);
  }
}
