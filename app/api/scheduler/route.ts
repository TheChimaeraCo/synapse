import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const tasks = await convexClient.query(api.functions.scheduler.list, {
      gatewayId: gatewayId as Id<"gateways">,
    });
    return NextResponse.json(tasks);
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const body = await req.json();
    const id = await convexClient.mutation(api.functions.scheduler.create, {
      gatewayId: gatewayId as Id<"gateways">,
      label: body.label,
      type: body.type || "once",
      cronExpr: body.cronExpr,
      scheduledAt: body.scheduledAt,
      sessionId: body.sessionId,
      payload: body.payload,
    });
    return NextResponse.json({ id });
  } catch (err) {
    return handleGatewayError(err);
  }
}
