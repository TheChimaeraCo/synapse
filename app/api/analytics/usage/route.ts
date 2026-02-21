import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();

    // Get message counts
    let messagesDay = 0;
    let messagesMonth = 0;
    let sessionsCreated = 0;

    try {
      const stats = await convex.query(api.functions.dashboard.getStats, {
        gatewayId: gatewayId as Id<"gateways">,
      });
      messagesDay = stats?.todayMessages ?? 0;
      messagesMonth = stats?.totalMessages ?? 0;
      sessionsCreated = stats?.activeSessions ?? 0;
    } catch (e) {
      // Dashboard stats may not exist
    }

    return NextResponse.json({
      messagesDay,
      messagesMonth,
      sessionsCreated,
      apiCalls: messagesDay * 2, // Rough estimate (request + response)
      limits: {
        messagesPerDay: 5000,
        messagesPerMonth: 100000,
        maxSessions: 500,
        maxApiCalls: 100000,
      },
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}
