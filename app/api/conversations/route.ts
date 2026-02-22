import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  try {
    const { userId, gatewayId } = await getGatewayContext(req);
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");

    if (sessionId) {
      const conversations = await convexClient.query(api.functions.conversations.listBySession, {
        sessionId: sessionId as Id<"sessions">,
        limit,
      });
      return NextResponse.json({ conversations });
    }

    const conversations = await convexClient.query(api.functions.conversations.list, {
      gatewayId: gatewayId as Id<"gateways">,
      limit,
    });
    return NextResponse.json({ conversations });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, gatewayId } = await getGatewayContext(req);
    const { sessionId, previousConvoId } = await req.json();

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const activeConvo = await convexClient.query(api.functions.conversations.getActive, {
      sessionId: sessionId as Id<"sessions">,
    });
    if (activeConvo) {
      await convexClient.mutation(api.functions.conversations.close, { id: activeConvo._id });
    }

    let depth = 1;
    if (previousConvoId) {
      const previous = await convexClient.query(api.functions.conversations.get, {
        id: previousConvoId as Id<"conversations">,
      });
      if (previous?.depth) depth = previous.depth + 1;
    }

    const convoId = await convexClient.mutation(api.functions.conversations.create, {
      sessionId: sessionId as Id<"sessions">,
      gatewayId: gatewayId as Id<"gateways">,
      userId: userId as Id<"authUsers"> | undefined,
      previousConvoId: previousConvoId as Id<"conversations"> | undefined,
      depth,
    });

    return NextResponse.json({ conversationId: convoId });
  } catch (err) {
    return handleGatewayError(err);
  }
}
