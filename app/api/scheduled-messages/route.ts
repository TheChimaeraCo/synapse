import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    if (sessionId) {
      const msgs = await convexClient.query(api.functions.scheduledMessages.list, { sessionId: sessionId as Id<"sessions"> });
      return NextResponse.json(msgs);
    }
    const msgs = await convexClient.query(api.functions.scheduledMessages.listPending, { gatewayId: gatewayId as Id<"gateways"> });
    return NextResponse.json(msgs);
  } catch (err) { return handleGatewayError(err); }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, gatewayId } = await getGatewayContext(req);
    const body = await req.json();
    const id = await convexClient.mutation(api.functions.scheduledMessages.create, {
      gatewayId: gatewayId as Id<"gateways">,
      sessionId: body.sessionId as Id<"sessions">,
      userId: userId as Id<"authUsers">,
      content: body.content,
      scheduledFor: body.scheduledFor,
    });
    return NextResponse.json({ id });
  } catch (err) { return handleGatewayError(err); }
}

export async function DELETE(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const body = await req.json();
    await convexClient.mutation(api.functions.scheduledMessages.cancel, { id: body.id as Id<"scheduledMessages"> });
    return NextResponse.json({ ok: true });
  } catch (err) { return handleGatewayError(err); }
}
