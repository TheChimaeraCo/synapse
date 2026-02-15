import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function GET(req: Request) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const state = await convex.query(api.functions.presence.getState, { gatewayId });
    return NextResponse.json(state || { gatewayId, lastActivity: 0, pendingQueue: [] });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const body = await req.json();
    await convex.mutation(api.functions.presence.setQuietHours, {
      gatewayId,
      quietHoursStart: body.quietHoursStart,
      quietHoursEnd: body.quietHoursEnd,
      timezone: body.timezone,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
