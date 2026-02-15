import { NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: Request) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();

    const [stats, recentSessions] = await Promise.all([
      convex.query(api.functions.dashboard.getStats, { gatewayId: gatewayId as Id<"gateways"> }),
      convex.query(api.functions.dashboard.getRecentSessions, { gatewayId: gatewayId as Id<"gateways">, limit: 10 }),
    ]);

    return NextResponse.json({ stats, recentSessions });
  } catch (err) {
    return handleGatewayError(err);
  }
}
