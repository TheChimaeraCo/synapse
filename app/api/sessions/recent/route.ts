import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  try {
    const { userId, gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();

    let sessions: any[] = [];
    try {
      sessions = await convex.query(api.functions.sessions.list, {
        gatewayId: gatewayId as Id<"gateways">,
        status: "active",
        limit: 5,
      });
    } catch (listErr: any) {
      console.warn("[recent] Failed to list sessions:", listErr.message);
    }

    if (sessions && sessions.length > 0) {
      return NextResponse.json(sessions[0]);
    }

    const channel = await convex.query(api.functions.channels.getByPlatform, {
      gatewayId: gatewayId as Id<"gateways">,
      platform: "hub",
    });

    if (!channel) {
      return NextResponse.json({ error: "Hub channel not configured" }, { status: 404 });
    }

    const sessionId = await convex.mutation(api.functions.sessions.findOrCreate, {
      gatewayId: gatewayId as Id<"gateways">,
      agentId: channel.agentId,
      channelId: channel._id,
      externalUserId: `hub:${userId}`,
      userId: userId as Id<"authUsers">,
    });

    return NextResponse.json({ _id: sessionId, isNew: true });
  } catch (err: any) {
    console.error("Recent session error:", err);
    return handleGatewayError(err);
  }
}
