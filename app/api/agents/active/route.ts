import { NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function GET(req: Request) {
  try {
    const { gatewayId, userId, role } = await getGatewayContext(req);
    const agents = await convexClient.query(api.functions.workerAgents.getSidebarFeed, {
      gatewayId: gatewayId as any,
      // Owners/admins can see all gateway worker agents; others are scoped to their sessions.
      userId: role === "owner" || role === "admin" ? undefined : (userId as any),
      limit: 100,
      historyHours: 24,
    });
    return NextResponse.json({ agents });
  } catch (err) {
    return handleGatewayError(err);
  }
}
