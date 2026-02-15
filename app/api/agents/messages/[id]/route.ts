import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

const convex = getConvexClient();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const { id } = await params;
    const body = await req.json();
    const { action, content, fromAgentId } = body;

    if (action === "read") {
      await convex.mutation(api.functions.agentMessages.markRead, { messageId: id as any });
      return NextResponse.json({ ok: true });
    }

    if (action === "reply") {
      if (!content || !fromAgentId) {
        return NextResponse.json({ error: "Missing fields for reply" }, { status: 400 });
      }
      const replyId = await convex.mutation(api.functions.agentMessages.reply, {
        originalMessageId: id as any,
        fromGatewayId: gatewayId as any,
        fromAgentId,
        content,
      });
      return NextResponse.json({ id: replyId });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return handleGatewayError(err);
  }
}
