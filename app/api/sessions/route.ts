import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  try {
    const { userId, gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as "active" | "archived" | undefined;
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const search = url.searchParams.get("search") || undefined;
    const channelId = url.searchParams.get("channelId");

    let sessions = await convex.query(api.functions.sessions.list, {
      gatewayId: gatewayId as Id<"gateways">,
      ...(status ? { status } : {}),
      limit,
    });

    if (channelId && sessions) {
      sessions = sessions.filter((s: any) => s.channelId === channelId);
    }

    if (search && sessions) {
      const q = search.toLowerCase();
      sessions = sessions.filter((s: any) =>
        (s.title || "").toLowerCase().includes(q) ||
        (s.lastMessagePreview || "").toLowerCase().includes(q)
      );
    }

    return NextResponse.json(sessions);
  } catch (err: any) {
    if (err.message?.includes("does not match") || err.message?.includes("not found")) return NextResponse.json([]);
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const body = await req.json();
    const channelId = body.channelId as Id<"channels">;

    if (!channelId) {
      return NextResponse.json({ error: "channelId required" }, { status: 400 });
    }

    const channel = await convex.query(api.functions.channels.get, { id: channelId });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    if (channel.platform !== "hub" && channel.platform !== "custom") {
      const channelSessions = await convex.query(api.functions.sessions.list, {
        gatewayId: gatewayId as Id<"gateways">,
        status: "active",
        limit: 50,
      });
      const platformSession = channelSessions?.find((s: any) => s.channelId === channelId);
      if (platformSession) {
        return NextResponse.json({ _id: platformSession._id, readOnly: false });
      }
      const sessionId = await convex.mutation(api.functions.sessions.findOrCreate, {
        gatewayId: gatewayId as Id<"gateways">,
        agentId: channel.agentId,
        channelId: channel._id,
        externalUserId: `${channel.platform}:web-bridge`,
      });
      return NextResponse.json({ _id: sessionId });
    }

    const sessionId = await convex.mutation(api.functions.sessions.findOrCreate, {
      gatewayId: gatewayId as Id<"gateways">,
      agentId: channel.agentId,
      channelId: channel._id,
      externalUserId: `hub:${userId}`,
      userId: userId as Id<"authUsers">,
    });

    return NextResponse.json({ _id: sessionId });
  } catch (err: any) {
    console.error("Create session error:", err);
    return handleGatewayError(err);
  }
}
