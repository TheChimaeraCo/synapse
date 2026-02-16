import { NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await getGatewayContext(req);
    const { sessionId } = await params;
    const convex = getConvexClient();

    const pins = await convex.query(api.functions.messagePins.listBySession, {
      sessionId: sessionId as Id<"sessions">,
    });

    return NextResponse.json({ pins });
  } catch (err: any) {
    return handleGatewayError(err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const ctx = await getGatewayContext(req);
    const { sessionId } = await params;
    const { messageId, note } = await req.json();
    if (!messageId) {
      return NextResponse.json({ error: "messageId required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const pinId = await convex.mutation(api.functions.messagePins.pin, {
      gatewayId: ctx.gatewayId as Id<"gateways">,
      sessionId: sessionId as Id<"sessions">,
      messageId: messageId as Id<"messages">,
      userId: ctx.userId as Id<"authUsers">,
      note,
    });

    return NextResponse.json({ pinId });
  } catch (err: any) {
    return handleGatewayError(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await getGatewayContext(req);
    const { messageId } = await req.json();
    if (!messageId) {
      return NextResponse.json({ error: "messageId required" }, { status: 400 });
    }

    const convex = getConvexClient();
    await convex.mutation(api.functions.messagePins.unpin, {
      messageId: messageId as Id<"messages">,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return handleGatewayError(err);
  }
}
