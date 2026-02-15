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
    const conversation = await convexClient.query(api.functions.conversations.get, {
      id: id as Id<"conversations">,
    });
    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let chain = null;
    if (conversation.previousConvoId) {
      chain = await convexClient.query(api.functions.conversations.getChain, {
        conversationId: id as Id<"conversations">,
        maxDepth: 5,
      });
    }

    return NextResponse.json({ conversation, chain });
  } catch (err) {
    return handleGatewayError(err);
  }
}
