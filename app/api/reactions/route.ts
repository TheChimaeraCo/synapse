import { NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: Request) {
  try {
    await getGatewayContext(req);
    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get("messageId");
    if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 });

    const convex = getConvexClient();
    const reactions = await convex.query(api.functions.messageReactions.getByMessage, {
      messageId: messageId as Id<"messages">,
    });

    return NextResponse.json({ reactions });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getGatewayContext(req);
    const body = await req.json();
    const { messageId, emoji } = body;

    if (!messageId || !emoji) {
      return NextResponse.json({ error: "messageId and emoji required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const result = await convex.mutation(api.functions.messageReactions.toggle, {
      messageId: messageId as Id<"messages">,
      userId: ctx.userId as Id<"authUsers">,
      gatewayId: ctx.gatewayId as Id<"gateways">,
      emoji,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleGatewayError(err);
  }
}
