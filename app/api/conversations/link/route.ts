import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function POST(req: NextRequest) {
  try {
    const { userId, gatewayId } = await getGatewayContext(req);
    const { sessionId, targetConvoId } = await req.json();

    let activeConvo = await convexClient.query(api.functions.conversations.getActive, {
      sessionId: sessionId as Id<"sessions">,
    });

    if (!activeConvo) {
      const newId = await convexClient.mutation(api.functions.conversations.create, {
        sessionId: sessionId as Id<"sessions">,
        gatewayId: gatewayId as Id<"gateways">,
        userId: userId as Id<"authUsers"> | undefined,
        previousConvoId: targetConvoId as Id<"conversations">,
        depth: 2,
      });
      return NextResponse.json({ linked: true, conversationId: newId, created: true });
    }

    const result = await convexClient.mutation(api.functions.conversations.linkTo, {
      id: activeConvo._id,
      targetConvoId: targetConvoId as Id<"conversations">,
    });

    return NextResponse.json({ ...result, conversationId: activeConvo._id });
  } catch (err) {
    return handleGatewayError(err);
  }
}
