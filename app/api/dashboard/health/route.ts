import { NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: Request) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const health = await convex.query(api.functions.dashboard.getSystemHealth, { gatewayId: gatewayId as Id<"gateways"> });
    return NextResponse.json(health);
  } catch (err) {
    return handleGatewayError(err);
  }
}
