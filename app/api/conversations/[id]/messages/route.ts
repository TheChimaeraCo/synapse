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
    const messages = await convexClient.query(api.functions.messages.listByConversation, {
      conversationId: id as Id<"conversations">,
      limit: 100,
    });
    return NextResponse.json({ messages });
  } catch (err) {
    return handleGatewayError(err);
  }
}
